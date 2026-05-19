<?php
// =====================================================
// Conexion.php · plantilla recomendada
// =====================================================
// IMPORTANTE: este archivo es solo una referencia/plantilla. Tu Conexion.php
// real está en el servidor y contiene las credenciales reales. Sustituye
// los placeholders por los tuyos y cambia el archivo en el hosting.
//
// El cambio clave para reducir el consumo de "max_connections_per_hour"
// es activar PDO::ATTR_PERSISTENT => true. Con ello PHP-FPM reutiliza la
// misma conexión entre peticiones del mismo worker, lo que en Hostinger
// reduce drásticamente el nº de conexiones contabilizadas.
// =====================================================

declare(strict_types=1);

final class Conexion
{
    private static ?PDO $pdo = null;

    public static function getPDO(): PDO
    {
        if (self::$pdo !== null) return self::$pdo;

        $host    = 'localhost';                       // p.ej. 127.0.0.1 o el host de Hostinger
        $dbname  = 'u204231532_Finanzas';
        $user    = 'u204231532_Finanzas';
        $pass    = 'TU_PASSWORD';                     // cámbialo
        $charset = 'utf8mb4';

        $dsn = "mysql:host={$host};dbname={$dbname};charset={$charset}";

        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            // *** CLAVE: reutilizar conexiones entre peticiones ***
            PDO::ATTR_PERSISTENT         => true,
        ];

        self::$pdo = new PDO($dsn, $user, $pass, $options);
        return self::$pdo;
    }
}
