/**
 * A chip on a message in the chat (the tool it came from, the picks the model view sent): one small
 * pill, 20px, on its own line over the words, quieter than them.
 */
export const CHAT_PILL =
  "inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded-full border border-border bg-accent/50 px-2 text-xs leading-none text-muted-foreground [&_svg]:size-3 [&_svg]:shrink-0";

/** The same pill, pressable. */
export const CHAT_PILL_BUTTON = `${CHAT_PILL} cursor-pointer outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset`;
