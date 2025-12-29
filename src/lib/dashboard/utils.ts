export const formatDateTime = (value?: string | null) => {
  if (!value) return "Not synced yet";
  return new Date(value).toLocaleString();
};

export const formatDate = (value?: string | null) => {
  if (!value) return "Unknown date";
  return new Date(value).toLocaleDateString();
};

export const truncate = (value: string, length: number) =>
  value.length > length ? `${value.slice(0, length)}...` : value;
