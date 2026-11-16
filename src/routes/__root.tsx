import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import styles from '../styles/app.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'Luma' },
    ],
    links: [{ rel: 'stylesheet', href: styles }],
  }),
  component: () => (
    <html lang="en">
      <head><HeadContent /></head>
      <body><Outlet /><Scripts /></body>
    </html>
  ),
});
