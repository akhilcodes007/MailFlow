/**
 * src/lib/demoConfig.js
 * Resolves frontend demo access configuration from the environment.
 *
 * SECURITY NOTICE:
 * All Vite environment variables (prefixed with VITE_) are embedded into the client
 * JavaScript bundle during build and are publicly inspectable by any browser user.
 *
 * For security reasons:
 * 1. Demo login must be strictly opt-in and disabled by default (VITE_ENABLE_DEMO_LOGIN === 'true').
 * 2. Never configure real production administrator credentials in Vite environment variables.
 * 3. Only dedicated, restricted demo accounts should ever be used.
 * 4. Demo login is only enabled when ALL three conditions are satisfied:
 *    - VITE_ENABLE_DEMO_LOGIN === 'true'
 *    - VITE_DEMO_EMAIL is configured and non-empty
 *    - VITE_DEMO_PASSWORD is configured and non-empty
 */

export function getDemoConfig(env = import.meta.env) {
  const isEnabled = env?.VITE_ENABLE_DEMO_LOGIN === 'true';
  const email = typeof env?.VITE_DEMO_EMAIL === 'string' ? env.VITE_DEMO_EMAIL.trim() : '';
  const password = typeof env?.VITE_DEMO_PASSWORD === 'string' ? env.VITE_DEMO_PASSWORD.trim() : '';
  const isDemoAvailable = isEnabled && email.length > 0 && password.length > 0;

  return {
    isDemoEnabled: isDemoAvailable,
    demoEmail: isDemoAvailable ? email : '',
    demoPassword: isDemoAvailable ? password : '',
  };
}
