export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
  address?: string | null;
  bio?: string | null;
  createdAt?: string | null;
}

export function isUser(value: unknown): value is User {
  if (typeof value !== "object" || value === null ||
    !("id" in value) || typeof value.id !== "string" || !value.id ||
    !("name" in value) || typeof value.name !== "string" ||
    !("email" in value) || typeof value.email !== "string") return false;
  return ["avatar", "address", "bio", "createdAt"].every((key) => {
    const field = Reflect.get(value, key);
    return field == null || typeof field === "string";
  });
}
