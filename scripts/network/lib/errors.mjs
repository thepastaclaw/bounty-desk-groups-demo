export function describeError(error) {
  const parts = [];
  if (error?.message) parts.push(error.message);
  try {
    const stringified = String(error);
    if (stringified && !parts.includes(stringified)) parts.push(stringified);
  } catch {
    // ignore
  }
  for (const method of ["toString", "toJSON", "valueOf"]) {
    try {
      if (typeof error?.[method] === "function") {
        const value = error[method]();
        const text = typeof value === "string" ? value : JSON.stringify(value);
        if (text && !parts.includes(text)) parts.push(text);
      }
    } catch {
      // ignore
    }
  }
  try {
    const own = Object.fromEntries(Object.entries(error ?? {}));
    const text = JSON.stringify(own);
    if (text && text !== "{}" && !parts.includes(text)) parts.push(text);
  } catch {
    // ignore
  }
  if (error?.stack) parts.push(error.stack);
  return parts.filter(Boolean).join("\n");
}

export async function main(fn) {
  try {
    await fn();
  } catch (error) {
    console.error(describeError(error) || error);
    process.exitCode = 1;
  }
}
