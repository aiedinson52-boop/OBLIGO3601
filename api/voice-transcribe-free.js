export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb'
        }
    }
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { audio, mimeType = 'audio/webm' } = req.body;
        if (!audio) return res.status(400).json({ error: 'No audio data' });

        const audioBuffer = Buffer.from(audio, 'base64');
        let transcript = '';

        // INTENTO 1: Deepgram (Gratis $200 / ultra rápido)
        const deepgramKey = process.env.DEEPGRAM_API_KEY;
        if (deepgramKey) {
            try {
                console.log('[voice-transcribe] Intentando con Deepgram...');
                const dgUrl = new URL('https://api.deepgram.com/v1/listen');
                dgUrl.searchParams.set('language', 'es-CO');
                dgUrl.searchParams.set('model', 'nova-2');
                dgUrl.searchParams.set('punctuate', 'true');

                const dgRes = await fetch(dgUrl.toString(), {
                    method: 'POST',
                    headers: {
                        'Authorization': `Token ${deepgramKey}`,
                        'Content-Type': mimeType
                    },
                    body: audioBuffer
                });

                if (dgRes.ok) {
                    const dgData = await dgRes.json();
                    transcript = dgData.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
                    if (transcript) {
                        return res.status(200).json({ success: true, transcript, method: 'deepgram' });
                    }
                } else {
                    console.log('[voice-transcribe] Deepgram falló con estado:', dgRes.status);
                }
            } catch (dgErr) {
                console.error('[voice-transcribe] Error en Deepgram:', dgErr.message);
            }
        }

        // INTENTO 2: Hugging Face Inference API (100% Gratis sin token)
        console.log('[voice-transcribe] Intentando con Hugging Face (alternativa gratis)...');
        const hfRes = await fetch('https://api-inference.huggingface.co/models/openai/whisper-large-v3-turbo', {
            method: 'POST',
            headers: { 'Content-Type': mimeType },
            body: audioBuffer
        });

        if (hfRes.ok) {
            const hfData = await hfRes.json();
            transcript = hfData.text || '';
            if (transcript) {
                return res.status(200).json({ success: true, transcript, method: 'huggingface' });
            }
        } else {
            const errText = await hfRes.text();
            throw new Error(`Hugging Face fallback falló: ${hfRes.status} - ${errText}`);
        }

        return res.status(400).json({ success: false, error: 'No se pudo obtener transcripción valid' });

    } catch (error) {
        console.error('[voice-transcribe] Error catastrófico:', error);
        return res.status(500).json({
            error: 'Transcription failed',
            message: error.message
        });
    }
}
