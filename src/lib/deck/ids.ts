/** Short ids are what the model sees ("c12"); stored ids are unique per deck ("<deckId>:c12"). */
export const chunkKey = (deckId: string, index: number) => `${deckId}:c${index}`;
export const shortId = (id: string) => id.slice(id.lastIndexOf(':') + 1);
