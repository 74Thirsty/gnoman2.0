type SafevaultValidationResult = {
  ok: boolean;
  reason?: string;
};

type SafevaultAPI = {
  validateLicense: (key: string) => SafevaultValidationResult;
  loadLicense: () => SafevaultValidationResult;
};

declare global {
  interface Window {
    safevault: SafevaultAPI;
  }
}

export {};
