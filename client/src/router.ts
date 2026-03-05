export interface Route {
  pattern: string;
  handler: (params: Record<string, string>) => void;
}

let routes: Route[] = [];

export function registerRoutes(newRoutes: Route[]): void {
  routes = newRoutes;
  window.addEventListener('hashchange', () => resolve());
}

export function navigate(hash: string): void {
  window.location.hash = hash;
}

export function resolve(): void {
  const rawHash = window.location.hash.slice(1) || '/groups';
  // Strip query string for route matching (handlers can read it from window.location.hash)
  const qIndex = rawHash.indexOf('?');
  const hash = qIndex !== -1 ? rawHash.slice(0, qIndex) : rawHash;

  for (const route of routes) {
    const params = matchRoute(route.pattern, hash);
    if (params !== null) {
      route.handler(params);
      return;
    }
  }

  // Default: go to groups
  navigate('/groups');
}

function matchRoute(pattern: string, hash: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const hashParts = hash.split('/').filter(Boolean);

  if (patternParts.length !== hashParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = hashParts[i];
    } else if (patternParts[i] !== hashParts[i]) {
      return null;
    }
  }
  return params;
}
