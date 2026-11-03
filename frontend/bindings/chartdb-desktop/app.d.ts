export interface CollaborationSession {
    url: string;
    urls: string[];
    token: string;
}

export function Greet(name: string): Promise<string>;
export function StartCollaboration(): Promise<CollaborationSession>;
export function StopCollaboration(): Promise<void>;
