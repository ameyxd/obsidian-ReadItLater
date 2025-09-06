import { request } from 'obsidian';
import { Note } from './Note';
import { Parser } from './Parser';

interface TiktokNoteData {
    date: string;
    videoId: string;
    videoURL: string;
    videoDescription: string;
    videoPlayer: string;
    authorName: string;
    authorURL: string;
}

class TikTokParser extends Parser {
    private CANONICAL_PATTERN = /(tiktok.com)\/(\S+)\/(video)\/(\d+)/;
    private SHORT_PATTERN = /((?:vt|vm)?\.?tiktok\.com)\/t\/([a-zA-Z0-9]+)/;

    async test(clipboardContent: string): Promise<boolean> {
        if (!this.isValidUrl(clipboardContent)) {
            return false;
        }

        if (this.CANONICAL_PATTERN.test(clipboardContent)) {
            return true;
        }

        if (this.SHORT_PATTERN.test(clipboardContent)) {
            try {
                const canonicalUrl = await this.resolveShortUrl(clipboardContent);
                return this.CANONICAL_PATTERN.test(canonicalUrl);
            } catch (error) {
                console.error('Failed to resolve TikTok short URL:', error);
                return false;
            }
        }

        return false;
    }

    private async resolveShortUrl(url: string): Promise<string> {
        const response = await request({
            method: 'GET',
            url,
            headers: {
                'user-agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
            },
        });

        const doc = new DOMParser().parseFromString(response, 'text/html');
        const canonical = doc.querySelector('link[rel="canonical"]');
        if (canonical && canonical.getAttribute('href')) {
            return canonical.getAttribute('href') as string;
        }

        // Fallback: try to find canonical URL in meta tags
        const metaUrl = doc.querySelector('meta[property="og:url"]');
        if (metaUrl && metaUrl.getAttribute('content')) {
            return metaUrl.getAttribute('content') as string;
        }

        throw new Error('Could not resolve canonical TikTok URL');
    }

    async prepareNote(clipboardContent: string): Promise<Note> {
        const createdAt = new Date();
        const data = await this.parseHtml(clipboardContent, createdAt);

        const content = this.templateEngine.render(this.plugin.settings.tikTokNote, data);

        const fileNameTemplate = this.templateEngine.render(this.plugin.settings.tikTokNoteTitle, {
            authorName: data.authorName,
            date: this.getFormattedDateForFilename(createdAt),
        });

        return new Note(fileNameTemplate, 'md', content, this.plugin.settings.tikTokContentTypeSlug, createdAt);
    }

    private async parseHtml(url: string, createdAt: Date): Promise<TiktokNoteData> {
        // If it's a short URL, resolve it first
        if (this.SHORT_PATTERN.test(url)) {
            url = await this.resolveShortUrl(url);
        }

        const response = await request({
            method: 'GET',
            url,
            headers: {
                'user-agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
            },
        });

        const videoHTML = new DOMParser().parseFromString(response, 'text/html');
        const videoRegexExec = this.CANONICAL_PATTERN.exec(url);

        return {
            date: this.getFormattedDateForContent(createdAt),
            videoId: videoRegexExec[4],
            videoURL: videoHTML.querySelector('meta[property="og:url"]')?.getAttribute('content') ?? url,
            videoDescription: videoHTML.querySelector('meta[property="og:description"]')?.getAttribute('content') ?? '',
            videoPlayer: `<iframe width="${this.plugin.settings.tikTokEmbedWidth}" height="${this.plugin.settings.tikTokEmbedHeight}" src="https://www.tiktok.com/embed/v2/${videoRegexExec[4]}"></iframe>`,
            authorName: videoRegexExec[2],
            authorURL: `https://www.tiktok.com/${videoRegexExec[2]}`,
        };
    }
}

export default TikTokParser;
