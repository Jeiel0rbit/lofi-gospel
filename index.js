/**
 * Bot de Rádio Lofi Gospel para Discord
 * Um bot focado em tocar estações de rádio lofi gospel, com comandos
 * restritos a moderadores e administradores.
 *
 * @version 1.0.0
 * @author Jeiel Miranda
 */

// ======================= IMPORTS =======================
const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    EmbedBuilder,
    ButtonStyle,
    PermissionsBitField
} = require('discord.js');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior
} = require('@discordjs/voice');


// ======================= CONFIGURAÇÃO =======================

// IMPORTANTE: Substitua 'SEU_TOKEN_AQUI' pelo token real do seu bot.
const TOKEN = 'SEU_TOKEN_AQUI';

// IDs dos usuários da equipe para serem notificados em caso de erro.
// Para pegar um ID: Ative o 'Modo Desenvolvedor' no Discord,
// clique com o botão direito no nome do usuário e 'Copiar ID do Usuário'.
const LOG_ACCESS_USER_IDS = ['USER', 'USER2'];

// Lista de estações de rádio Lofi Gospel.
const STATIONS = [
    { name: 'Gospel Lofi', url: 'https://centova4.transmissaodigital.com:20278/stream?1751027477622'},
    { name: 'Rádio Lofirise Gospel', url: 'https://stm1.radionline.top:7004/stream/1/'},
];


// ======================= ESTADO GLOBAL =======================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

// Mapeia o estado da rádio (player, conexão, etc.) para cada servidor.
const guildStates = new Map();

// Mapeia o nome do comando à sua função de execução.
const commands = new Map();


// ======================= FUNÇÕES AUXILIARES =======================

// Centraliza o tratamento de erros, logando e notificando a equipe no Discord.
async function handleError(error, context) {
    console.error('--- ERRO INESPERADO CAPTURADO ---', error);

    const devMentions = LOG_ACCESS_USER_IDS.map(id => `<@${id}>`).join(' ');
    const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('🚨 Oops! Algo deu errado.')
        .setDescription('Um erro inesperado aconteceu. A equipe de desenvolvimento já foi notificada.')
        .addFields({ name: 'Mensagem de Erro', value: `\`\`\`${error.message}\`\`\`` })
        .setTimestamp();

    try {
        const channel = context.channel || context;
        if (channel && typeof channel.send === 'function') {
            await channel.send({ content: devMentions, embeds: [errorEmbed] });
        }
    } catch (sendError) {
        console.error('--- FALHA AO ENVIAR MENSAGEM DE ERRO NO DISCORD ---', sendError);
    }
}

// Inicia a reprodução de uma estação de rádio no player de um servidor.
function playStation(guildId) {
    const state = guildStates.get(guildId);
    if (!state || !state.player) return;

    try {
        const station = STATIONS[state.currentStationIndex];
        const resource = createAudioResource(station.url);
        state.player.play(resource);

        state.player.once(AudioPlayerStatus.Playing, () => {
            console.log(`Reproduzindo "${station.name}" no servidor ${guildId}`);
        });
    } catch (error) {
        handleError(error, state.messageChannel);
    }
}


// ======================= LÓGICA DOS COMANDOS =======================

// Executa o comando '!sjoin', conectando o bot ao canal de voz e iniciando a rádio.
async function executeJoin(message) {
    if (!message.member?.voice?.channel) {
        return message.reply('Você precisa estar em um canal de voz para eu me juntar!');
    }
    const voiceChannel = message.member.voice.channel;

    let state = guildStates.get(message.guild.id);
    if (!state) {
        const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
        
        player.on('error', (error) => {
            console.log(`--- ERRO DO PLAYER NO SERVIDOR ${message.guild.id} ---`);
            error.message = `Erro na estação "${STATIONS[state.currentStationIndex].name}": ${error.message}`;
            handleError(error, state.messageChannel);
            
            // Adiciona um pequeno delay e tenta a próxima estação para evitar loops rápidos.
            setTimeout(() => {
                state.currentStationIndex = (state.currentStationIndex + 1) % STATIONS.length;
                playStation(message.guild.id);
            }, 2000);
        });

        state = { player, connection: null, currentStationIndex: 0, messageChannel: message.channel };
        guildStates.set(message.guild.id, state);
    }

    state.connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
    });
    state.connection.subscribe(state.player);

    playStation(message.guild.id);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('changeStation').setLabel('Mudar Estação').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('leaveChannel').setLabel('Sair').setStyle(ButtonStyle.Danger)
    );
    const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('📻 LoFi Gospel Radio')
        .setDescription(`Tocando agora: **${STATIONS[state.currentStationIndex].name}**`)
        .setFooter({ text: 'Relaxe e aproveite a música!' });

    await message.channel.send({ embeds: [embed], components: [row] });
}

// Executa o comando '!sleave', desconectando o bot do canal de voz.
async function executeLeave(message) {
    const state = guildStates.get(message.guild.id);
    if (state?.connection) {
        state.connection.destroy();
        guildStates.delete(message.guild.id);
        await message.reply('Até mais! Desconectado do canal de voz.');
    } else {
        await message.reply('Eu não estou em um canal de voz neste servidor.');
    }
}

// Executa o comando '!shelp', mostrando a mensagem de ajuda com os comandos.
async function executeHelp(message) {
    const helpEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('Comandos do LoFi Gospel Bot')
        .setDescription('Comandos disponíveis (apenas para admins/mods):')
        .addFields(
            { name: '!sjoin', value: 'Entra no canal de voz e começa a tocar a rádio.' },
            { name: '!sleave', value: 'Sai do canal de voz.' },
            { name: '!shelp', value: 'Exibe esta mensagem de ajuda.' }
        );
    await message.channel.send({ embeds: [helpEmbed] });
}


// ======================= HANDLERS DE EVENTOS =======================

// Executado quando o bot fica online e pronto para operar.
client.once('ready', () => {
    console.log(`Bot está online e pronto como ${client.user.tag}`);
});

// Trata todas as interações recebidas, como cliques em botões.
client.on('interactionCreate', async (interaction) => {
    try {
        if (!interaction.isButton()) return;
        
        const hasPermission = interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild);
        if (!hasPermission) {
            return interaction.reply({ content: 'Você não tem permissão para usar este botão.', ephemeral: true });
        }
        
        const state = guildStates.get(interaction.guild.id);

        if (interaction.customId === 'changeStation') {
            if (!state?.connection) {
                return interaction.message.edit({ content: 'Não estou mais em um canal de voz.', components: [] });
            }

            state.currentStationIndex = (state.currentStationIndex + 1) % STATIONS.length;
            playStation(interaction.guild.id);

            const embed = new EmbedBuilder().setColor(0x0099ff).setTitle('📻 LoFi Gospel Radio').setDescription(`Tocando agora: **${STATIONS[state.currentStationIndex].name}**`).setFooter({ text: 'Estação alterada!' });
            await interaction.update({ embeds: [embed] });

        } else if (interaction.customId === 'leaveChannel') {
            if (state?.connection) {
                state.connection.destroy();
                guildStates.delete(interaction.guild.id);
                await interaction.update({ content: 'Até mais! Fui desconectado.', embeds: [], components: [] });
            }
        }
    } catch (error) {
        handleError(error, interaction);
    }
});

// Processa todas as mensagens recebidas e direciona para o comando correspondente.
client.on('messageCreate', async (message) => {
    try {
        if (message.author.bot || !message.guild || !message.content.startsWith('!s')) return;

        const hasPermission = message.member.permissions.has(PermissionsBitField.Flags.ManageGuild);
        if (!hasPermission) {
            return message.reply('Desculpe, você não tem permissão para usar este comando!');
        }

        const args = message.content.slice(2).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();
        
        const command = commands.get(commandName);
        if (command) {
            await command(message, args);
        }

    } catch (error) {
        handleError(error, message);
    }
});


// ======================= INICIALIZAÇÃO =======================

// Ponto de entrada principal que registra os comandos e inicia o bot.
function main() {
    commands.set('join', executeJoin);
    commands.set('leave', executeLeave);
    commands.set('help', executeHelp);

    client.login(TOKEN).catch(error => {
        console.error('--- FALHA CRÍTICA AO FAZER LOGIN ---');
        console.error('Verifique se o TOKEN fornecido é válido e se as INTENTS estão corretas.');
        console.error(error.message);
    });
}

main();