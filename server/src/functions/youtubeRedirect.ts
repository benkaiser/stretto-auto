import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { Readable } from 'stream';
import ytdl = require("@distube/ytdl-core");
import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from "@azure/identity";


export async function youtubeRedirect(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    try {
        context.log(`Http function processed request for url "${request.url}"`);
        const videoId = request.query.get('id');
        if (!videoId) {
            return { status: 400, body: "Please provide a video ID with ?id=." };
        }

        context.log('Checking storage account');
        context.log(process.env.AZURE_STORAGE_CONNECTION_STRING);
        let blobServiceClient: BlobServiceClient;
        if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
            context.log('Using connection string');
            blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
        } else {
            context.log('Using DefaultAzureCredential');
            const account = process.env.AZURE_STORAGE_ACCOUNT_NAME;
            const defaultAzureCredential = new DefaultAzureCredential();
            blobServiceClient = new BlobServiceClient(
                `https://${account}.blob.core.windows.net`,
                defaultAzureCredential
            );
        }

        context.log('Checking container');
        context.log(process.env.AZURE_BLOB_CONTAINER_NAME);
        const containerClient = blobServiceClient.getContainerClient(process.env.AZURE_BLOB_CONTAINER_NAME);
        context.log('Checking blob');
        context.log(videoId);
        const blockBlobClient = containerClient.getBlockBlobClient(videoId);
        const blobExists = await blockBlobClient.exists();

        if (blobExists) {
            context.log(`Blob "${videoId}" already exists.`);
            return { status: 302, headers: { Location: blockBlobClient.url } };
        }

        let agent: ytdl.Agent | undefined;
        try {
            if (process.env.YOUTUBE_COOKIES) {
                agent = ytdl.createAgent(JSON.parse(process.env.YOUTUBE_COOKIES));
            }
        } catch (error) {
            context.error(`Error parsing youtube cookies: ${error}`);
        }

        context.log(`Blob "${videoId}" does not exist. Downloading stream...`);
        let stream: Readable;
        let format: ytdl.videoFormat;
        try {
            let options = {
                filter: 'audioonly' as ytdl.Filter,
                quality: 'highestaudio'
            };
            let info = await ytdl.getInfo(videoId, { agent: agent });
            format = ytdl.chooseFormat(info.formats, options);
            context.log(format);
            stream = ytdl(videoId, { ...options, agent: agent });
        } catch (error) {
            context.error(`Error getting youtube info: ${error}`);
            return { status: 500, body: "Failed to download stream." };
        }

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
            context.error(error);
            context.error(`${error.message}`);
            return { status: 500, body: "Failed to create redirect." };
        }
    } catch (error) {
        context.error(`Error: ${error}`);
        return { status: 500, body: "Failed to process request." };
    }
};

app.http('youtubeRedirect', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: youtubeRedirect
});