import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TrackInfo } from "soundcloud-downloader/src/info";
import { Readable } from 'stream';
const scdl = require('soundcloud-downloader').default;

app.setup({ enableHttpStream: true });

export async function soundcloud(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const soundId = request.query.get('id');
    const info: TrackInfo[] = await scdl.getTrackInfoByID([soundId]);
    if (!info || !info.length) {
        return { status: 404 };
    }
    const SOUNDCLOUD_URL = info[0].permalink_url;
    const stream: Readable = await scdl.downloadFormat(SOUNDCLOUD_URL, scdl.FORMATS.MP3);
    return { headers: {
        'Content-Type': 'audio/mpeg',
    }, body: stream };
};

app.http('soundcloud', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: soundcloud
});
