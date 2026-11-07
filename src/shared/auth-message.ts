export function signInMessage(address: string, nonce: string, host: string) {
  return [
    `${host} wants you to sign in to The Last District with:`,
    address,
    "",
    "This only proves you control this wallet. It costs nothing, sends no transaction and can't move, approve or lock any Squeek.",
    "",
    `Nonce: ${nonce}`,
  ].join("\n");
}
