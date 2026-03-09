export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb'
        }
    }
};

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.DEEPGRAM_API_KEY;

    if (!apiKey) {
        console.error('[voice-transcribe] DEEPGRAM_API_KEY not configured');
        return res.status(500).json({ error: 'STT service not configured' });
    }

    try {
        const { audio, mimeType } = req.body;

        if (!audio) {
            return res.status(400).json({ error: 'No audio data provided' });
        }

        // Normalizar mimeType
        let cleanMimeType = mimeType || 'audio/webm';
        if (cleanMimeType.includes(';')) {
            cleanMimeType = cleanMimeType.split(';')[0];
        }

        // Decodificar audio de base64
        const audioBuffer = Buffer.from(audio, 'base64');

        // Llamar a Deepgram API
        const deepgramUrl = new URL('https://api.deepgram.com/v1/listen');
        deepgramUrl.searchParams.set('language', 'es-CO');
        deepgramUrl.searchParams.set('model', 'nova-2');
        deepgramUrl.searchParams.set('punctuate', 'true');
        deepgramUrl.searchParams.set('smart_format', 'true');

        const response = await fetch(deepgramUrl.toString(), {
            method: 'POST',
            headers: {
                'Authorization': `Token ${apiKey}`,
                'Content-Type': cleanMimeType
            },
            body: audioBuffer
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[voice-transcribe] Deepgram error:', errorText);
            return res.status(response.status).json({
                success: false,
                error: 'Deepgram transcription failed',
                details: errorText
            });
        }

        const result = await response.json();

        // Extraer transcripción
        const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
        const confidence = result.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;

        if (!transcript) {
            return res.status(400).json({
                success: false,
                error: 'No speech detected in audio'
            });
        }

        return res.status(200).json({
            success: true,
            transcript,
            confidence,
            language: 'es-CO',
            method: 'deepgram'
        });

    } catch (error) {
        console.error('[voice-transcribe] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
}
