import { isMissingNativeModule, MISSING_NATIVE_MESSAGE } from '../nativeModules';

describe('isMissingNativeModule', () => {
  it('reconoce los errores de módulos nativos que faltan', () => {
    expect(isMissingNativeModule(new Error("Cannot find native module 'ExponentFileSystem'"))).toBe(true);
    expect(isMissingNativeModule(new Error("Cannot find native module 'ExpoPrint'"))).toBe(true);
    expect(isMissingNativeModule(new Error('The native module ExpoSharing is null'))).toBe(true);
    expect(isMissingNativeModule("Error: requireNativeModule('ExponentImagePicker') failed")).toBe(true);
    expect(isMissingNativeModule({ message: 'The package is not linked' })).toBe(true);
  });

  it('reconoce el UnavailabilityError del shim de expo-file-system/legacy', () => {
    // Sin el módulo nativo, `expo-file-system/legacy` carga un shim y es
    // writeAsStringAsync quien falla con este error (code ERR_UNAVAILABLE).
    const err = Object.assign(
      new Error(
        "The method or property expo-file-system.writeAsStringAsync is not available on android, are you sure you've linked all the native dependencies properly?",
      ),
      { code: 'ERR_UNAVAILABLE' },
    );
    expect(isMissingNativeModule(err)).toBe(true);
    expect(isMissingNativeModule({ code: 'ERR_UNAVAILABLE', message: '' })).toBe(true);
  });

  it('reconoce su propio mensaje (lo lanza receiptPicker.native)', () => {
    expect(isMissingNativeModule(new Error(MISSING_NATIVE_MESSAGE))).toBe(true);
  });

  it('reconoce el aviso de TurboModuleRegistry', () => {
    expect(
      isMissingNativeModule(
        new Error("TurboModuleRegistry.getEnforcing(...): 'ExpoSharing' could not be found. Verify that a module by this name is registered in the native binary."),
      ),
    ).toBe(true);
  });

  it('no confunde otros errores', () => {
    expect(isMissingNativeModule(new Error('Network Error'))).toBe(false);
    expect(isMissingNativeModule(new Error('Request failed with status code 403'))).toBe(false);
    expect(isMissingNativeModule(null)).toBe(false);
    expect(isMissingNativeModule(undefined)).toBe(false);
  });

  it('un fallo real de un módulo que SÍ está instalado no se confunde con "actualiza la app"', () => {
    expect(
      isMissingNativeModule(
        new Error("Call to function 'ExpoPrint.printToFileAsync' has been rejected.\n→ Caused by: WebView failed to load"),
      ),
    ).toBe(false);
    expect(
      isMissingNativeModule(
        new Error("Call to function 'ExponentFileSystem.writeAsStringAsync' has been rejected.\n→ Caused by: No space left on device"),
      ),
    ).toBe(false);
  });
});
