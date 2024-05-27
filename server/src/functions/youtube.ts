import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { Readable } from 'stream';
import ytdl = require("ytdl-core");

app.setup({ enableHttpStream: true });

export async function youtube(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const videoId = request.query.get('id');
    const stream: Readable = ytdl('http://www.youtube.com/watch?v=' + videoId, {
        filter: 'audioonly',
        quality: 'highestaudio'
    });
    return { body: stream };
};

app.http('youtube', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: youtube
});
