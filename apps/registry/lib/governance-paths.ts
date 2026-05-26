export function governancePath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === "/") {
    return "/governance";
  }
  return `/governance${normalized}`;
}

