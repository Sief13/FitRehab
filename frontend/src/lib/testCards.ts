/** The only card numbers the sandbox checkout accepts (same idea as a real gateway's test mode). */
export const TEST_CARDS = [
  { number: "4242 4242 4242 4242", result: "payment succeeds" },
  { number: "4000 0000 0000 0002", result: "card declined" },
  { number: "4000 0000 0000 9995", result: "insufficient funds" },
] as const;

/** Real card numbers are rejected here, in the browser, so they are never sent anywhere. */
export function isTestCard(digitsOnly: string): boolean {
  return TEST_CARDS.some((c) => c.number.replace(/\s/g, "") === digitsOnly);
}

/** "4242424242424242" -> "4242 4242 4242 4242" while the user types */
export function formatCardNumber(input: string): string {
  return input
    .replace(/\D/g, "")
    .slice(0, 19)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}
