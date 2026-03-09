export default async function handler(req, res) {
    // Retorna la hora UTC del servidor de Vercel
    const now = new Date();
    return res.status(200).json({
        unixtime: Math.floor(now.getTime() / 1000),
        datetime: now.toISOString(),
        timezone: 'UTC'
    });
}
