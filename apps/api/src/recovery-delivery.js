export function createRecoveryDelivery(config) {
  const testDeliveriesByEmail = new Map();
  const exposeTestToken = Boolean(config.recoveryExposeTestToken);

  return {
    kind: exposeTestToken ? "local-test-token-store" : "delivery-abstraction-only",

    async sendPasswordReset({ user, token, resetUrl, expiresAt }) {
      if (exposeTestToken) {
        testDeliveriesByEmail.set(user.email.toLowerCase(), {
          email: user.email.toLowerCase(),
          token,
          resetUrl,
          expiresAt,
          capturedAt: new Date().toISOString()
        });
        return { status: "stored_for_test", delivered: true };
      }
      return { status: "delivery_unconfigured", delivered: false };
    },

    getTestDelivery(email) {
      if (!exposeTestToken) return null;
      return testDeliveriesByEmail.get(String(email || "").trim().toLowerCase()) || null;
    }
  };
}
