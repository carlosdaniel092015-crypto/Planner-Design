import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth';
import { ForgotPage, LoginPage, SetPasswordPage } from './pages/Auth';
import { EditorPage } from './pages/Editor';
import { HomePage } from './pages/Home';

const router = createBrowserRouter([
  {
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/olvide', element: <ForgotPage /> },
      { path: '/restablecer', element: <SetPasswordPage mode="reset" /> },
      { path: '/invitacion', element: <SetPasswordPage mode="invite" /> },
      { path: '/', element: <RequireAuth><HomePage /></RequireAuth> },
      { path: '/proyectos/:id', element: <RequireAuth><EditorPage /></RequireAuth> },
      { path: '*', element: <RequireAuth><HomePage /></RequireAuth> },
    ],
  },
]);

const style = document.createElement('style');
style.textContent = `
  html,body{margin:0;height:100%}
  :root{--sp-canvas:#e4e1dc}
  [data-theme="dark"]{--color-bg:#1d1c1b;--color-surface:#282726;--color-text:#eeecea;--color-divider:color-mix(in srgb,#eeecea 28%,transparent);--sp-canvas:#131211;--color-accent-100:#3a1c16;--color-accent-800:#ffc4b8;--color-accent-700:#ff9783;--color-neutral-100:#2d2b2b;--color-neutral-200:#343231;--color-neutral-800:#d7d3d3}
  a{color:var(--color-accent-700)}a:hover{color:var(--color-accent-600)}
  @keyframes spspin{to{transform:rotate(360deg)}}
  @keyframes sppulse{0%,100%{opacity:.45}50%{opacity:1}}
`;
document.head.appendChild(style);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
