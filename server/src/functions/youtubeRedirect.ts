import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { Readable } from 'stream';
import ytdl = require("@distube/ytdl-core");
import { BlobServiceClient } from '@azure/storage-blob';

export async function youtubeRedirect(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);
    const videoId = request.query.get('id');
    if (!videoId) {
        return { status: 400, body: "Please provide a video ID with ?id=." };
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(process.env.AZURE_BLOB_CONTAINER_NAME);
    // Create the container if it does not exist
    const createContainerResponse = await containerClient.createIfNotExists({
        access: 'blob'
    });
    if (createContainerResponse.succeeded) {
        context.log(`Container "${process.env.AZURE_BLOB_CONTAINER_NAME}" created successfully.`);
    } else {
        context.log(`Container "${process.env.AZURE_BLOB_CONTAINER_NAME}" already exists.`);
    }
    const blockBlobClient = containerClient.getBlockBlobClient(videoId);
    const blobExists = await blockBlobClient.exists();

    if (blobExists) {
        context.log(`Blob "${videoId}" already exists.`);
        return { status: 302, headers: { Location: blockBlobClient.url } };
    }

    let options = {
        filter: 'audioonly' as ytdl.Filter,
        quality: 'highestaudio'
    };
    let info = await ytdl.getInfo(videoId);
    let format = ytdl.chooseFormat(info.formats, options);
    const stream: Readable = ytdl(videoId, options);


    try {
        // Upload stream to blob
        await blockBlobClient.uploadStream(stream, undefined, undefined, {
            blobHTTPHeaders: {
                blobContentType: format.mimeType
            }
        });
        context.log(`Stream uploaded to blob storage as ${videoId} with mimeType ${format.mimeType}`);
        return { status: 302 , headers: { Location: blockBlobClient.url } };
    } catch (error) {
        context.error(`Error uploading stream to blob: ${error}`);
        return { status: 500, body: "Failed to create redirect." };
    }
};

app.http('youtubeRedirect', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: youtubeRedirect
});