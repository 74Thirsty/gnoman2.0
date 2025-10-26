export type SafevaultLicenseResult = {
  ok: boolean;
  reason?: string;
};

declare global {
  interface Window {
    safevault?: {
      validateLicense: (key: string) => SafevaultLicenseResult;
      loadLicense: () => SafevaultLicenseResult;
    };
  }
}

export {};
