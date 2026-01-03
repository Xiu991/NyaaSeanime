/// <reference path="./anime-torrent-provider.d.ts" />
/// <reference path="./core.d.ts" />

// ===================================================================
// Extension Nyaa.si pour Seanime - Tous les animes (VOSTFR/VF/RAW)
// ===================================================================
// Cette extension vous permet de rechercher et télécharger des animes
// depuis Nyaa.si, le plus grand site de torrents d'animes au monde.
// Supporte : VOSTFR, VF, anglais, et versions brutes japonaises
// Auteur : Xiu991
// ===================================================================

interface ExtendedAnimeTorrent extends AnimeTorrent {
    id: number;
}

interface NyaaTorrent {
    id: number;
    name: string;
    category: string;
    url: string;
    download_url: string;
    magnet: string;
    size: string;
    date: string;
    seeders: number;
    leechers: number;
    completed_downloads: number;
}

class Provider {
    
    apiUrl: string;
    baseUrl: string;

    constructor() {
        this.apiUrl = "https://nyaaapi.onrender.com";
        this.baseUrl = "https://nyaa.si";
    }

    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: true,
            smartSearchFilters: ["batch", "episodeNumber", "resolution", "query"],
            supportsAdult: false,
            type: "main",
        };
    }

    async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        // Recherche basique sur Nyaa.si
        const url = `${this.apiUrl}/nyaa?query=${encodeURIComponent(opts.query)}&category=anime&sort=seeders&order=desc`;
        return this.fetchFromApi(url);
    }

    async smartSearch(opts: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        // Construction de la requête intelligente
        let query = opts.query || opts.media.romajiTitle || opts.media.englishTitle || "";
        
        // Ajouter VOSTFR/French pour rechercher du contenu français
        if (!query.toLowerCase().includes("vostfr") && !query.toLowerCase().includes("french")) {
            query += " VOSTFR";
        }
        
        // Ajouter le numéro d'épisode si spécifié
        if (opts.episodeNumber > 0 && !opts.batch) {
            query += ` ${String(opts.episodeNumber).padStart(2, '0')}`;
        }
        
        // Ajouter la résolution si spécifiée
        if (opts.resolution) {
            query += ` ${opts.resolution}`;
        }
        
        let url = `${this.apiUrl}/nyaa?query=${encodeURIComponent(query)}&category=anime&sort=seeders&order=desc`;
        
        let torrents = await this.fetchFromApi(url);
        
        // Filtrage post-recherche
        if (opts.batch) {
            torrents = torrents.filter(t => t.isBatch);
        }
        
        if (opts.episodeNumber > 0 && !opts.batch) {
            torrents = torrents.filter(t => 
                t.episodeNumber === opts.episodeNumber || 
                t.name.includes(`${String(opts.episodeNumber).padStart(2, '0')}`)
            );
        }
        
        if (opts.resolution) {
            const targetRes = opts.resolution.replace('p', '');
            torrents = torrents.filter(t => (t.resolution || "").includes(targetRes));
        }

        return torrents;
    }

    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
        // Le magnet link est déjà fourni par l'API
        if (torrent.magnetLink) {
            return torrent.magnetLink;
        }
        
        // Si pas de magnet, on récupère depuis l'URL de téléchargement
        if (torrent.downloadUrl) {
            try {
                const response = await fetch(torrent.downloadUrl);
                const blob = await response.blob();
                // Extraire le hash du fichier torrent (simplifié)
                // En pratique, Nyaa fournit toujours le magnet
                return torrent.magnetLink || "";
            } catch (e) {
                console.error("Erreur lors de la récupération du torrent:", e);
                return "";
            }
        }
        
        return "";
    }

    async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> {
        if (torrent.infoHash) return torrent.infoHash;
        
        // Extraire le hash du magnet link
        const magnetLink = await this.getTorrentMagnetLink(torrent);
        if (magnetLink) {
            const match = magnetLink.match(/btih:([a-fA-F0-9]{40})/);
            if (match) {
                torrent.infoHash = match[1];
                return match[1];
            }
        }
        
        return "";
    }

    async getLatest(): Promise<AnimeTorrent[]> {
        // Récupérer les derniers torrents d'anime
        const url = `${this.apiUrl}/nyaa?category=anime&sort=date&order=desc`;
        return this.fetchFromApi(url);
    }
    
    private async fetchFromApi(url: string): Promise<AnimeTorrent[]> {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Nyaa API Error: Status ${response.status}`);
            }
            
            const data = await response.json<{ data: NyaaTorrent[] }>();
            
            if (!data || !data.data || !Array.isArray(data.data)) {
                console.error("Format de réponse invalide de l'API Nyaa");
                return [];
            }
            
            return data.data.map(item => this.convertToAnimeTorrent(item));
        } catch (error) {
            console.error("Erreur lors de la récupération depuis Nyaa API:", error);
            return [];
        }
    }

    private convertToAnimeTorrent(nyaaTorrent: NyaaTorrent): ExtendedAnimeTorrent {
        const parsed = this.parseTorrentName(nyaaTorrent.name);
        
        return {
            id: nyaaTorrent.id,
            name: nyaaTorrent.name,
            date: nyaaTorrent.date,
            size: nyaaTorrent.size,
            formattedSize: nyaaTorrent.size,
            seeders: nyaaTorrent.seeders,
            leechers: nyaaTorrent.leechers,
            downloadCount: nyaaTorrent.completed_downloads,
            link: nyaaTorrent.url,
            downloadUrl: nyaaTorrent.download_url,
            magnetLink: nyaaTorrent.magnet,
            infoHash: this.extractHashFromMagnet(nyaaTorrent.magnet),
            resolution: parsed.resolution,
            isBatch: parsed.isBatch,
            episodeNumber: parsed.episodeNumber,
            releaseGroup: parsed.releaseGroup,
            isBestRelease: nyaaTorrent.seeders > 50,
            confirmed: nyaaTorrent.seeders > 10,
        };
    }

    private extractHashFromMagnet(magnetLink: string): string | undefined {
        if (!magnetLink) return undefined;
        const match = magnetLink.match(/btih:([a-fA-F0-9]{40})/);
        return match ? match[1] : undefined;
    }

    private parseTorrentName(name: string): {
        resolution: string,
        episodeNumber: number,
        isBatch: boolean,
        releaseGroup: string | undefined
    } {
        let resolution = "";
        let episodeNumber = -1;
        let isBatch = false;
        let releaseGroup: string | undefined = undefined;
        
        // Extraire la résolution (1080p, 720p, 480p, 2160p, etc.)
        const resMatch = name.match(/(\d{3,4})p/i);
        if (resMatch) {
            resolution = resMatch[1];
        }
        
        // Extraire le numéro d'épisode (plusieurs formats possibles)
        // Format: E01, EP01, Episode 01, - 01, etc.
        const epPatterns = [
            /[Ee](?:pisode|p)?\s?(\d{1,3})/,
            /\s-\s(\d{1,3})(?:\s|v|$)/,
            /\[(\d{1,3})\]/,
            /S\d{1,2}E(\d{1,3})/i,
        ];
        
        for (const pattern of epPatterns) {
            const match = name.match(pattern);
            if (match) {
                episodeNumber = parseInt(match[1], 10);
                break;
            }
        }
        
        // Détecter si c'est un batch/pack complet
        const batchKeywords = [
            /batch/i,
            /integrale?/i,
            /collection/i,
            /complete/i,
            /saison/i,
            /season/i,
            /pack/i,
            /s\d{1,2}(?!e\d)/i,
            /01-\d{2,3}/,
            /\d{1,3}~\d{1,3}/,
        ];
        
        for (const keyword of batchKeywords) {
            if (keyword.test(name)) {
                isBatch = true;
                episodeNumber = -1;
                break;
            }
        }
        
        // Extraire le groupe de release
        // Format: [Groupe], (Groupe), ou -Groupe à la fin
        const groupPatterns = [
            /^\[([^\]]+)\]/,
            /\(([^)]+)\)$/,
            /[\-_]([A-Za-z]+)$/,
        ];
        
        for (const pattern of groupPatterns) {
            const match = name.match(pattern);
            if (match) {
                releaseGroup = match[1].trim();
                break;
            }
        }
        
        return { resolution, episodeNumber, isBatch, releaseGroup };
    }
}
