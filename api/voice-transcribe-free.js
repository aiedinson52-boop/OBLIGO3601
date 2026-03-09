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

    console.log('[voice-transcribe-free] Iniciando petición...');

    try {
        const { audio, mimeType } = req.body;
        if (!audio) return res.status(400).json({ error: 'No audio data' });

        // Normalizar mimeType (Deepgram y HF pueden ser sensibles a ";codecs=opus")
        let cleanMimeType = mimeType || 'audio/webm';
        if (cleanMimeType.includes(';')) {
            cleanMimeType = cleanMimeType.split(';')[0];
        }

        const audioBuffer = Buffer.from(audio, 'base64');
        let transcript = '';
        let errors = [];

        // INTENTO 1: Deepgram (Estrategia Pro)
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
                        return res.status(200).json({
                            success: true,
                            transcript,
                            confidence,
                            method: 'deepgram'
                        });
                    } else {
                        console.warn('[voice-transcribe-free] Deepgram devolvió transcripción vacía.');
                        errors.push('Deepgram: Empty transcript');
                    }
                } else {
                    const dgErrText = await dgRes.text();
                    console.error(`[voice-transcribe-free] Deepgram falló (${dgRes.status}):`, dgErrText);
                    errors.push(`Deepgram status ${dgRes.status}: ${dgErrText.substring(0, 100)}`);
                }
            } catch (dgErr) {
                console.error('[voice-transcribe-free] Error catastrófico en Deepgram:', dgErr);
                errors.push(`Deepgram error: ${dgErr.message}`);
            }
        } else {
            console.warn('[voice-transcribe-free] DEEPGRAM_API_KEY no configurado.');
            errors.push('Deepgram: Key not found');
        }

        // INTENTO 2: Hugging Face Inference API (Fallback)
        console.log('[voice-transcribe-free] Intentando fallback con Hugging Face (Whisper v3 Turbo)...');
        try {
            const hfRes = await fetch('https://api-inference.huggingface.co/models/openai/whisper-large-v3-turbo', {
                method: 'POST',
                headers: { 'Content-Type': cleanMimeType },
                body: audioBuffer
            });

            if (hfRes.ok) {
                const hfData = await hfRes.json();
                transcript = hfData.text || '';
                if (transcript) {
                    console.log(`[voice-transcribe-free] Éxito con Hugging Face: "${transcript}"`);
                    return res.status(200).json({
                        success: true,
                        transcript,
                        method: 'huggingface'
                    });
                } else {
                    errors.push('HuggingFace: Empty transcript');
                }
            } else {
                let errText = 'Desconocido';
                try { errText = await hfRes.text(); } catch (e) { }
                console.error(`[voice-transcribe-free] Hugging Face falló (${hfRes.status}):`, errText);
                errors.push(`HuggingFace status ${hfRes.status}`);
            }
        } catch (hfErr) {
            console.error('[voice-transcribe-free] Error en HF:', hfErr);
            errors.push(`HuggingFace error: ${hfErr.message}`);
        }

        // Si llegamos aquí, nada funcionó
        console.error('[voice-transcribe-free] Todos los métodos de transcripción fallaron.');
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
