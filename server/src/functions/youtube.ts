import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { createReadStream, createWriteStream } from "fs";
import { Readable } from 'stream';
import ytdl = require("ytdl-core");

app.setup({ enableHttpStream: true });

export async function youtube(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const videoId = request.query.get('v');
    const stream: Readable = ytdl('http://www.youtube.com/watch?v=' + videoId, {
        filter: 'audioonly',
        quality: 'highestaudio'
    });
    return { body: stream };
};

app.http('youtube', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: youtube
});
