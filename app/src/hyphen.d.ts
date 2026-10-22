/* the hyphen package ships without types; only the English synchronous call is used */
declare module 'hyphen/en' {
  export function hyphenateSync(text: string, options?: { hyphenChar?: string; minWordLength?: number }): string;
}
