export const openDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('AstraeaDB', 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('transcriptions')) {
                db.createObjectStore('transcriptions', { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
};

export const saveTranscription = async (item) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('transcriptions', 'readwrite');
        const store = transaction.objectStore('transcriptions');
        const request = store.put(item);

        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
};

export const getAllTranscriptions = async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('transcriptions', 'readonly');
        const store = transaction.objectStore('transcriptions');
        const request = store.getAll();

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
};

export const deleteTranscription = async (id) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('transcriptions', 'readwrite');
        const store = transaction.objectStore('transcriptions');
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
};
