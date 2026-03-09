export const config = {
    api: {
        bodyParser: false, // Desactiva el parseo automático para recibir el Buffer binario directamente
    }
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    console.log('[voice-transcribe-free] Iniciando petición...');

    try {
        // 1. Leer el Buffer binario (raw body) nativamente de Vercel/Node stream
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(chunk);
        }
        const audioBuffer = Buffer.concat(chunks);

        if (audioBuffer.length === 0) {
            return res.status(400).json({ error: 'No audio data received' });
        }

        // Normalizar mimeType
        let cleanMimeType = req.headers['content-type'] || 'audio/webm';
        if (cleanMimeType.includes(';')) {
            cleanMimeType = cleanMimeType.split(';')[0];
        }

        let transcript = '';
        let errors = [];

        // INTENTO 1: Deepgram (Mejor Calidad y Rapidez, Estrategia Pro)
        const deepgramKey = process.env.DEEPGRAM_API_KEY;
        if (deepgramKey && deepgramKey.trim() !== "") {
            try {
                console.log('[voice-transcribe-free] Intentando con Deepgram (nova-2)...');
                const dgUrl = new URL('https://api.deepgram.com/v1/listen');
                dgUrl.searchParams.set('language', 'es-CO');
                dgUrl.searchParams.set('model', 'nova-2');
                dgUrl.searchParams.set('punctuate', 'true');
                dgUrl.searchParams.set('smart_format', 'true');

                const dgRes = await fetch(dgUrl.toString(), {
                    method: 'POST',
                    headers: {
                        'Authorization': `Token ${deepgramKey}`,
                        'Content-Type': cleanMimeType
                    },
                    body: audioBuffer
                });

                if (dgRes.ok) {
                    const dgData = await dgRes.json();
                    transcript = dgData.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
                    const confidence = dgData.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;

                    if (transcript) {
                        console.log(`[voice-transcribe-free] Éxito con Deepgram: "${transcript}"`);
                        return res.status(200).json({ success: true, transcript, confidence, method: 'deepgram' });
                    }
                } else {
                    const dgErrText = await dgRes.text();
                    errors.push(`Deepgram status ${dgRes.status}: ${dgErrText.substring(0, 100)}`);
                }
            } catch (dgErr) {
                errors.push(`Deepgram error: ${dgErr.message}`);
            }
        } else {
            errors.push('Deepgram: Key not found');
        }

        // INTENTO 2: Hugging Face Inference API (Fallback Gratuito - Requiere Token)
        // Hugging Face eliminó su endpoint abierto. Ahora REQUIERE un token de autorización en el endpoint router.
        const hfToken = process.env.HF_TOKEN;

        if (hfToken) {
            console.log('[voice-transcribe-free] Intentando fallback con Hugging Face (Whisper v3 Turbo)...');
            try {
                const hfRes = await fetch('https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3-turbo', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${hfToken}`,
                        'Content-Type': cleanMimeType
                    },
                    body: audioBuffer
                });

                if (hfRes.ok) {
                    const hfData = await hfRes.json();
                    transcript = hfData.text || '';
                    if (transcript) {
                        console.log(`[voice-transcribe-free] Éxito con Hugging Face: "${transcript}"`);
                        return res.status(200).json({ success: true, transcript, method: 'huggingface' });
                    } else {
                        errors.push('HuggingFace: Empty transcript');
                    }
                } else {
                    let errText = 'Desconocido';
                    try { errText = await hfRes.text(); } catch (e) { }
                    errors.push(`HuggingFace status ${hfRes.status}: ${errText.substring(0, 100)}`);
                }
            } catch (hfErr) {
                errors.push(`HuggingFace error: ${hfErr.message}`);
            }
        } else {
            console.warn('[voice-transcribe-free] HF_TOKEN no configurado en Vercel.');
            errors.push('HuggingFace: HF_TOKEN missing. Configure token to use free fallback.');
        }

        // Si llegamos aquí, nada funcionó (el error 400 que causaba el fallo principal)
        console.error('[voice-transcribe-free] Todos los métodos de transcripción fallaron:', errors);
        return res.status(400).json({
            success: false,
            error: 'No se pudo obtener una transcripción válida',
            details: errors.join(' | ')
        });

    } catch (error) {
        console.error('[voice-transcribe-free] Error global:', error);
        return res.status(500).json({
            error: 'Catastrophic failure',
            message: error.message
        });
    }
}
