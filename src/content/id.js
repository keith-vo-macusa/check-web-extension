/**
 * Client-side ids for bugs and comments, used until the server assigns real ones.
 */
export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const randomValue = (16 * Math.random()) | 0;
        return (char === 'x' ? randomValue : (randomValue & 3) | 8).toString(16);
    });
}
