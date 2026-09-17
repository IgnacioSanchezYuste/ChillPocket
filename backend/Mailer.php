<?php

declare(strict_types=1);

/**
 * Cliente SMTP mínimo para los correos transaccionales (códigos de verificación
 * y de recuperación de contraseña).
 *
 * Sin dependencias a propósito: el vendor del servidor solo trae Slim y php-jwt,
 * y el despliegue es por FTP. Usa TLS implícito (puerto 465) y AUTH LOGIN, que es
 * lo que ofrece Hostinger.
 *
 * Configuración (primero variable de entorno, luego constante de clase
 * `Conexion::X`, luego constante global `X`), definida en Conexion.php:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_FROM_NAME
 */
final class Mailer
{
    private const TIMEOUT_SECONDS = 15;

    private string $host;
    private int $port;
    private string $user;
    private string $pass;
    private string $fromEmail;
    private string $fromName;

    private function __construct(string $host, int $port, string $user, string $pass, string $fromEmail, string $fromName)
    {
        $this->host      = $host;
        $this->port      = $port;
        $this->user      = $user;
        $this->pass      = $pass;
        $this->fromEmail = $fromEmail;
        $this->fromName  = $fromName;
    }

    /** Devuelve null si falta configuración: el llamante decide qué hacer. */
    public static function fromConfig(): ?self
    {
        $host = self::config('SMTP_HOST');
        $user = self::config('SMTP_USER');
        $pass = self::config('SMTP_PASS');
        if ($host === '' || $user === '' || $pass === '') return null;

        $from = self::config('SMTP_FROM') ?: $user;
        if (!self::isSafeAddress($from)) return null;

        $port = (int)(self::config('SMTP_PORT') ?: '465');
        $name = self::config('SMTP_FROM_NAME') ?: 'ChillPocket';

        return new self($host, $port, $user, $pass, $from, $name);
    }

    private static function config(string $key): string
    {
        $env = getenv($key);
        if (is_string($env) && $env !== '') return $env;
        if (class_exists('Conexion', false) && defined("Conexion::$key")) {
            return (string)constant("Conexion::$key");
        }
        if (defined($key)) return (string)constant($key);
        return '';
    }

    /**
     * Dirección apta para ir en una línea SMTP y en una cabecera.
     *
     * FILTER_VALIDATE_EMAIL NO basta: acepta partes locales entre comillas con
     * LF, CR o NUL escapados (p. ej. "a\<LF>DATA"@x.com) y literales de dominio.
     * Se rechaza cualquier control, espacio, comilla, barra invertida, <>, (),
     * [], coma o punto y coma antes de validar: evita inyección de comandos
     * SMTP y de cabeceras.
     */
    public static function isSafeAddress(string $email): bool
    {
        if ($email === '' || strlen($email) > 254) return false;
        if (preg_match('/[\x00-\x20\x7F"\\\\<>()\[\],;]/', $email)) return false;
        return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
    }

    /**
     * Envía un correo con parte de texto y parte HTML.
     *
     * @throws RuntimeException si la conexión o algún comando SMTP falla.
     */
    public function send(string $toEmail, string $subject, string $textBody, string $htmlBody): void
    {
        if (!self::isSafeAddress($toEmail)) {
            throw new InvalidArgumentException('Destinatario no válido');
        }

        // TLS verificado (certificado y nombre) y como mínimo TLS 1.2.
        $cryptoMethod = STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
        if (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT')) {
            $cryptoMethod |= STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT;
        }
        $context = stream_context_create([
            'ssl' => [
                'verify_peer'       => true,
                'verify_peer_name'  => true,
                'allow_self_signed' => false,
                'peer_name'         => $this->host,
                'crypto_method'     => $cryptoMethod,
            ],
        ]);
        $errno  = 0;
        $errstr = '';
        // Los fallos de TLS (certificado, nombre, CA) solo llegan como avisos de PHP:
        // con errno/errstr el error queda en "(0 )" y no hay forma de diagnosticarlo.
        $warnings = [];
        set_error_handler(static function (int $no, string $msg) use (&$warnings): bool {
            $warnings[] = preg_replace('/^stream_socket_client\(\):\s*/', '', $msg);
            return true;
        });
        try {
            $socket = stream_socket_client(
                "ssl://{$this->host}:{$this->port}",
                $errno,
                $errstr,
                self::TIMEOUT_SECONDS,
                STREAM_CLIENT_CONNECT,
                $context
            );
        } finally {
            restore_error_handler();
        }
        if ($socket === false) {
            $why = implode(' · ', array_unique(array_filter($warnings)));
            throw new RuntimeException(
                "SMTP: no se pudo conectar a {$this->host}:{$this->port} ($errno $errstr)" . ($why !== '' ? ": $why" : '')
            );
        }
        stream_set_timeout($socket, self::TIMEOUT_SECONDS);

        try {
            $this->expect($socket, [220]);
            $this->command($socket, 'EHLO ' . $this->heloDomain(), [250]);
            $this->command($socket, 'AUTH LOGIN', [334]);
            $this->command($socket, base64_encode($this->user), [334], 'AUTH (usuario)');
            $this->command($socket, base64_encode($this->pass), [235], 'AUTH (credenciales)');
            $this->command($socket, 'MAIL FROM:<' . $this->fromEmail . '>', [250]);
            $this->command($socket, 'RCPT TO:<' . $toEmail . '>', [250, 251]);
            $this->command($socket, 'DATA', [354]);

            $message = $this->buildMessage($toEmail, $subject, $textBody, $htmlBody);
            // Dot-stuffing (RFC 5321 §4.5.2) y fin de datos.
            $message = preg_replace('/^\./m', '..', $message);
            $this->write($socket, $message . "\r\n.\r\n");
            $this->expect($socket, [250]);

            try {
                $this->command($socket, 'QUIT', [221]);
            } catch (RuntimeException $e) {
                // El correo ya está aceptado; un QUIT fallido no importa.
            }
        } finally {
            fclose($socket);
        }
    }

    private function heloDomain(): string
    {
        $domain = substr((string)strrchr($this->fromEmail, '@'), 1);
        return $domain !== '' ? $domain : 'localhost';
    }

    private function buildMessage(string $toEmail, string $subject, string $textBody, string $htmlBody): string
    {
        $boundary = 'cp_' . bin2hex(random_bytes(12));
        $headers = [
            'Date: ' . date(DATE_RFC2822),
            'From: ' . $this->encodeHeader($this->fromName) . ' <' . $this->fromEmail . '>',
            'To: <' . $toEmail . '>',
            'Subject: ' . $this->encodeHeader($subject),
            'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . $this->heloDomain() . '>',
            'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        ];

        $parts = [
            '--' . $boundary,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            rtrim(chunk_split(base64_encode($textBody), 76, "\r\n")),
            '--' . $boundary,
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            rtrim(chunk_split(base64_encode($htmlBody), 76, "\r\n")),
            '--' . $boundary . '--',
        ];

        return implode("\r\n", $headers) . "\r\n\r\n" . implode("\r\n", $parts);
    }

    /** RFC 2047: la codificación base64 impide también la inyección de saltos de línea. */
    private function encodeHeader(string $value): string
    {
        return '=?UTF-8?B?' . base64_encode($value) . '?=';
    }

    /** @param resource $socket */
    private function write($socket, string $data): void
    {
        $length = strlen($data);
        $written = 0;
        while ($written < $length) {
            $n = fwrite($socket, substr($data, $written));
            if ($n === false || $n === 0) {
                throw new RuntimeException('SMTP: error de escritura');
            }
            $written += $n;
        }
    }

    /**
     * @param resource $socket
     * @param int[] $expected
     */
    private function command($socket, string $line, array $expected, ?string $label = null): void
    {
        $this->write($socket, $line . "\r\n");
        $this->expect($socket, $expected, $label ?? strtok($line, ' '));
    }

    /**
     * Lee una respuesta (posiblemente multilínea: "250-..." hasta "250 ...").
     *
     * @param resource $socket
     * @param int[] $expected
     */
    private function expect($socket, array $expected, string $label = 'saludo'): void
    {
        $code = 0;
        $last = '';
        while (($line = fgets($socket, 1024)) !== false) {
            $last = rtrim($line);
            $code = (int)substr($line, 0, 3);
            if (strlen($line) < 4 || $line[3] !== '-') break;
        }
        if (!in_array($code, $expected, true)) {
            // Nunca incluimos las credenciales: solo el comando y la respuesta del
            // servidor, recortada (puede repetir la dirección del destinatario).
            $last = substr((string)preg_replace('/[\x00-\x1F\x7F]/', ' ', $last), 0, 160);
            throw new RuntimeException("SMTP $label: respuesta inesperada ($last)");
        }
    }
}
