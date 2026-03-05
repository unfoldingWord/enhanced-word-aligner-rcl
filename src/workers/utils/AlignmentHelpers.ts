
/**
 * Calculates the complexity of a verse based on the lengths of the source and target text.
 *
 * @param {number} sourceLength - The length of the source text.
 * @param {number} targetLength - The length of the target text.
 * @return {number} The calculated complexity as a numeric value.
 */
export function getComplexityOfVerse(sourceLength: number, targetLength: number): number {
    const totalLength = sourceLength + targetLength + sourceLength * targetLength;
    return totalLength;
}
