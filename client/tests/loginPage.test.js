/**
 * client/tests/loginPage.test.js
 * Frontend unit and component-interaction tests for MailFlow LoginPage and Demo Access.
 *
 * DEPENDENCY JUSTIFICATION:
 * Uses `jsdom` (added as a devDependency in client) to provide a standards-compliant
 * DOM environment (window, document, navigator, localStorage, MouseEvent). This enables
 * testing genuine DOM mounting (createRoot), actual DOM button clicks (button.click()),
 * React form state updates, and React Router navigation to /dashboard without altering
 * production component signatures or exposing internal test hooks.
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

describe('MailFlow Frontend Demo Access & LoginPage Tests', () => {
  let dom;

  before(() => {
    // Initialize JSDOM environment
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'http://localhost/login',
      pretendToBeVisual: true,
    });
    const defineGlobal = (key, val) => {
      try {
        Object.defineProperty(globalThis, key, { value: val, configurable: true, writable: true });
      } catch {
        globalThis[key] = val;
      }
    };
    defineGlobal('window', dom.window);
    defineGlobal('document', dom.window.document);
    defineGlobal('navigator', dom.window.navigator);
    defineGlobal('localStorage', dom.window.localStorage);
    defineGlobal('HTMLElement', dom.window.HTMLElement);
    defineGlobal('HTMLButtonElement', dom.window.HTMLButtonElement);
    defineGlobal('HTMLInputElement', dom.window.HTMLInputElement);
    defineGlobal('MouseEvent', dom.window.MouseEvent);
    defineGlobal('Event', dom.window.Event);
    defineGlobal('CustomEvent', dom.window.CustomEvent);
    defineGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    localStorage.clear();
  });

  describe('demoConfig Helper Suite', async () => {
    const { getDemoConfig } = await import('../src/lib/demoConfig.js');

    it('disables demo mode when flag is missing or not "true"', () => {
      // Flag explicitly false
      assert.deepEqual(
        getDemoConfig({ VITE_ENABLE_DEMO_LOGIN: 'false', VITE_DEMO_EMAIL: 'admin@example.com', VITE_DEMO_PASSWORD: 'Password123!' }),
        { isDemoEnabled: false, demoEmail: '', demoPassword: '' }
      );

      // Flag omitted / undefined
      assert.deepEqual(
        getDemoConfig({ VITE_DEMO_EMAIL: 'admin@example.com', VITE_DEMO_PASSWORD: 'Password123!' }),
        { isDemoEnabled: false, demoEmail: '', demoPassword: '' }
      );

      // Arbitrary truthy value that is not exact string 'true'
      assert.deepEqual(
        getDemoConfig({ VITE_ENABLE_DEMO_LOGIN: '1', VITE_DEMO_EMAIL: 'admin@example.com', VITE_DEMO_PASSWORD: 'Password123!' }),
        { isDemoEnabled: false, demoEmail: '', demoPassword: '' }
      );
    });

    it('disables demo mode when email is missing or whitespace-only', () => {
      assert.equal(
        getDemoConfig({ VITE_ENABLE_DEMO_LOGIN: 'true', VITE_DEMO_EMAIL: '', VITE_DEMO_PASSWORD: 'Password123!' }).isDemoEnabled,
        false
      );

      assert.equal(
        getDemoConfig({ VITE_ENABLE_DEMO_LOGIN: 'true', VITE_DEMO_PASSWORD: 'Password123!' }).isDemoEnabled,
        false
      );

      assert.equal(
        getDemoConfig({ VITE_ENABLE_DEMO_LOGIN: 'true', VITE_DEMO_EMAIL: '    ', VITE_DEMO_PASSWORD: 'Password123!' }).isDemoEnabled,
        false
      );
    });

    it('disables demo mode when password is missing or whitespace-only', () => {
      assert.equal(
        getDemoConfig({ VITE_ENABLE_DEMO_LOGIN: 'true', VITE_DEMO_EMAIL: 'admin@example.com', VITE_DEMO_PASSWORD: '' }).isDemoEnabled,
        false
      );

      assert.equal(
        getDemoConfig({ VITE_ENABLE_DEMO_LOGIN: 'true', VITE_DEMO_EMAIL: 'admin@example.com' }).isDemoEnabled,
        false
      );

      assert.equal(
        getDemoConfig({ VITE_ENABLE_DEMO_LOGIN: 'true', VITE_DEMO_EMAIL: 'admin@example.com', VITE_DEMO_PASSWORD: '    ' }).isDemoEnabled,
        false
      );
    });

    it('enables demo mode and returns trimmed credentials when valid', () => {
      const config = getDemoConfig({
        VITE_ENABLE_DEMO_LOGIN: 'true',
        VITE_DEMO_EMAIL: '  demo@example.com  ',
        VITE_DEMO_PASSWORD: '  DemoPass123!  ',
      });

      assert.equal(config.isDemoEnabled, true);
      assert.equal(config.demoEmail, 'demo@example.com');
      assert.equal(config.demoPassword, 'DemoPass123!');
    });
  });

  describe('LoginPage Component Rendering & Click Interaction Suite', () => {
    it('hides Quick Login button by default in production configuration', async () => {
      const server = await createServer({
        root: '.',
        configFile: './vite.config.js',
        define: {},
      });

      const { default: LoginPage } = await server.ssrLoadModule('./src/pages/LoginPage.jsx');
      const { AuthProvider } = await server.ssrLoadModule('./src/contexts/AuthContext.jsx');

      const container = document.getElementById('root');
      const root = createRoot(container);

      await act(async () => {
        root.render(
          React.createElement(MemoryRouter, { initialEntries: ['/login'] },
            React.createElement(AuthProvider, null,
              React.createElement(LoginPage)
            )
          )
        );
      });

      // Quick Login button must NOT exist in the DOM
      const button = document.querySelector('button[aria-label="Quick Login with Demo Account"]');
      assert.equal(button, null, 'Quick Login button must not be present when demo mode is disabled');

      // Verify standard login inputs are present
      const emailInput = document.querySelector('input[type="email"]');
      const passwordInput = document.querySelector('input[type="password"]');
      assert.ok(emailInput, 'Email input must exist');
      assert.ok(passwordInput, 'Password input must exist');

      await act(async () => {
        root.unmount();
      });
      await server.close();
    });

    it('genuinely clicks the rendered Quick Login button, populates credentials, executes login, and navigates to /dashboard', async () => {
      const demoEmail = 'admin@example.com';
      const demoPassword = 'AdminPass123!';

      const server = await createServer({
        root: '.',
        configFile: './vite.config.js',
        define: {
          'import.meta.env.VITE_ENABLE_DEMO_LOGIN': JSON.stringify('true'),
          'import.meta.env.VITE_DEMO_EMAIL': JSON.stringify(demoEmail),
          'import.meta.env.VITE_DEMO_PASSWORD': JSON.stringify(demoPassword),
        },
      });

      const { default: LoginPage } = await server.ssrLoadModule('./src/pages/LoginPage.jsx');
      const { AuthProvider } = await server.ssrLoadModule('./src/contexts/AuthContext.jsx');
      const apiModule = await server.ssrLoadModule('./src/lib/api.js');

      // Intercept backend auth calls from the real AuthProvider
      let authCallPayload = null;
      apiModule.default.post = async (url, payload) => {
        if (url === '/auth/login') {
          authCallPayload = payload;
          return {
            data: {
              success: true,
              token: 'test_demo_jwt_token',
              user: { id: 'admin_id_123', email: payload.email, role: 'admin' },
            },
          };
        }
        return { data: {} };
      };
      apiModule.default.get = async () => ({ data: { user: null } });

      const container = document.getElementById('root');
      const root = createRoot(container);

      await act(async () => {
        root.render(
          React.createElement(MemoryRouter, { initialEntries: ['/login'] },
            React.createElement(AuthProvider, null,
              React.createElement(Routes, null,
                React.createElement(Route, { path: '/login', element: React.createElement(LoginPage) }),
                React.createElement(Route, { path: '/dashboard', element: React.createElement('div', { id: 'dashboard-target' }, 'Welcome to Admin Dashboard') })
              )
            )
          )
        );
      });

      // Locate the rendered Quick Login button in the actual DOM
      const button = document.querySelector('button[aria-label="Quick Login with Demo Account"]');
      assert.ok(button, 'Quick Login button must be rendered in the DOM');
      assert.equal(button.textContent.includes('Quick Login — Demo Account'), true);

      // Verify email & password fields are initially empty
      const emailInput = document.querySelector('input[type="email"]');
      const passwordInput = document.querySelector('input[type="password"]');
      assert.equal(emailInput.value, '');
      assert.equal(passwordInput.value, '');

      // Genuinely trigger DOM click on the rendered button
      await act(async () => {
        button.click();
      });

      // Verify credentials were sent to backend auth endpoint
      assert.deepEqual(authCallPayload, {
        email: demoEmail,
        password: demoPassword,
      });

      // Verify input values were populated with configured demo credentials
      assert.equal(emailInput.value, demoEmail);
      assert.equal(passwordInput.value, demoPassword);

      // Verify successful authentication navigated to /dashboard
      const dashboardEl = document.getElementById('dashboard-target');
      assert.ok(dashboardEl, 'Must navigate to /dashboard upon successful demo login');
      assert.equal(dashboardEl.textContent, 'Welcome to Admin Dashboard');

      // Verify auth token was persisted to localStorage
      assert.equal(localStorage.getItem('mf_token'), 'test_demo_jwt_token');

      await act(async () => {
        root.unmount();
      });
      await server.close();
    });
  });
});
