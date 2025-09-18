type localeMap = { [key: string]: string };
type localesMap = { [langId: string]: localeMap };

/**
 * Singleton class for handling localization throughout the application.
 * It provides translations based on the loaded locale data and currently set language.
 */
class Localization {
    private static instance: Localization;
    private localeData: localesMap;
    private currentLanguage: string = 'en';
    private customTranslations: Record<string, Record<string, string>> = {};

    /**
     * Private constructor to prevent direct instantiation.
     * @param initialData - The initial localization data
     */
    private constructor(initialData: localesMap) {
        this.localeData = initialData;
    }

    /**
     * Gets the singleton instance of the Localization class.
     * @returns The Localization instance
     */
    public static getInstance(): Localization {
        if (!Localization.instance) {
            Localization.instance = new Localization({});
        }
        return Localization.instance;
    }

    /**
     * Sets the current language for translations.
     * @param language - The language code to set
     * @returns The Localization instance for chaining
     */
    public hasKeys(): boolean {
        const keys = Object.keys(this.localeData);
        return keys.length > 0;
    }

    /**
     * Sets the locale data for the localization handler.
     *
     * @param {localesMap} initialData - An object containing localized data mapped to their respective locale keys.
     * @return {Localization} The current instance of the Localization object for chaining purposes.
     */
    public setLocaleData(initialData: localesMap): Localization {
        this.localeData = initialData;
        return this;
    }

    /**
     * Sets the current language for translations.
     * @param language - The language code to set
     * @returns The Localization instance for chaining
     */
    public setLanguage(language: string): Localization {
        this.currentLanguage = language;
        return this;
    }

    /**
     * Gets a translated string for the given key.  Parameters in translated string will be in format such as `{{name}}`
     * @param key - The translation key to look up
     * @param params - Optional parameters to substitute in the translation
     * @returns The translated string or the key if no translation is found
     */
    public translate(key: string, params?: Record<string, string | number>): string {
        const localeMap = this.localeData?.[this.currentLanguage];
        const localeString = localeMap?.[key];
        if (localeString) {
            return this.substituteParams(localeString, params);
        }

        // Return the key if no translation is found
        console.warn(`Translation missing for key: ${key}`);
        return key;
    }

    /**
     * Gets all available translation keys.
     * @returns Array of translation keys
     */
    public getAvailableKeys(): string[] {
        return Object.keys(this.localeData);
    }

    /**
     * Substitutes parameters in a translation string.  The parameters will be in format such as `{{name}}`
     * @param text - The translation text with placeholders
     * @param params - The parameters to substitute
     * @returns The text with substituted parameters
     */
    private substituteParams(text: string, params?: Record<string, string | number>): string {
        if (!params) return text;

        let result = text;
        Object.entries(params).forEach(([key, value]) => {
            result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        });

        return result;
    }

    /**
     * Creates a translate function bound to the current instance.
     * Useful for passing to components that expect a translate function.
     * @returns A translate function
     */
    public getTranslateFunction(): (key: string, params?: Record<string, string | number>) => string {
        return this.translate.bind(this);
    }
}

// Export the singleton instance getter
export const getLocalization = Localization.getInstance;

// Export a convenience function for translations
export const t = (key: string, params?: Record<string, string | number>): string => {
    return getLocalization().translate(key, params);
};

export const locale_init = ((initialData: localesMap) => {
    return getLocalization().setLocaleData(initialData)
})

export const is_initialized = ((initialData: localesMap) => {
    return getLocalization().hasKeys()
})

export default getLocalization;