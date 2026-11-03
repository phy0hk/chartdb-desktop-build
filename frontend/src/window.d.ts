declare global {
    interface Window {
        env?: Record<string, string>;
        go?: {
            main?: {
                App?: {
                    StartCollaboration: () => Promise<{
                        url: string;
                        urls: string[];
                        token: string;
                    }>;
                    StopCollaboration: () => Promise<void>;
                };
            };
        };
    }
}
export {};
