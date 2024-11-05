import FastLink from "@performanc/fastlink";
import Discord from "discord.js";
import fs from "fs";

class MusicBot {
  constructor(token, botId) {
    this.token = token;
    this.botId = botId;
    this.client = new Discord.Client({
      partials: [Discord.Partials.Channel],
      intents: [
        Discord.IntentsBitField.Flags.Guilds,
        Discord.IntentsBitField.Flags.MessageContent,
        Discord.IntentsBitField.Flags.GuildMessages,
        Discord.IntentsBitField.Flags.GuildVoiceStates,
      ],
    });

    this.events = FastLink.node.connectNodes(
      [
        {
          hostname: "127.0.0.1",
          secure: false,
          password: "youshallnotpass",
          port: 2333,
        },
      ],
      {
        botId: this.botId,
        shards: 1,
        queue: true,
      }
    );

    this.events.on("debug", console.log);
    this.prefix = "!";
    this._bindEvents();
  }

  _bindEvents() {
    this.client.on("messageCreate", this._onMessage.bind(this));
    this.client.on("raw", (data) => FastLink.other.handleRaw(data));
  }

  async _onMessage(message) {
    if (message.author.bot) return;

    const commandName = message.content
      .split(" ")[0]
      .toLowerCase()
      .substring(this.prefix.length);
    const args = message.content.split(" ").slice(1).join(" ");

    switch (commandName) {
      case "decodetrack":
        await this._handleDecodeTrack(message, args);
        break;
      case "record":
        this._handleRecord(message);
        break;
      case "stoprecord":
        this._handleStopRecord(message);
        break;
      case "play":
        await this._handlePlay(message, args);
        break;
      case "volume":
        this._handleVolume(message, args);
        break;
      case "pause":
        this._handlePause(message);
        break;
      case "resume":
        this._handleResume(message);
        break;
      case "skip":
        this._handleSkip(message);
        break;
      case "stop":
        this._handleStop(message);
        break;
      default:
        break;
    }
  }

  async _handleDecodeTrack(message, args) {
    const player = new FastLink.player.Player(message.guild.id);
    if (!player.playerCreated()) {
      message.channel.send("No player found.");
      return;
    }

    const track = await player.decodeTrack(args);
    message.channel.send(JSON.stringify(track, null, 2));
  }

  _handleRecord(message) {
    const player = new FastLink.player.Player(message.guild.id);
    if (!player.playerCreated()) {
      message.channel.send("No player found.");
      return;
    }

    const voiceEvents = player.listen();
    voiceEvents.on("endSpeaking", (voice) => {
      const base64Voice = voice.data;
      const buffer = Buffer.from(base64Voice, "base64");
      const previousVoice =
        fs.readFileSync(`./voice-${message.author.id}.ogg`) || null;
      fs.writeFileSync(
        `./voice-${message.author.id}.ogg`,
        previousVoice ? Buffer.concat([previousVoice, buffer]) : buffer
      );
    });

    message.channel.send(
      "Started recording. Be aware: This will record everything you say in the voice channel, even if the bot is deaf. Server deaf the bot if you don't want to be recorded."
    );
  }

  _handleStopRecord(message) {
    const player = new FastLink.player.Player(message.guild.id);
    if (!player.playerCreated()) {
      message.channel.send("No player found.");
      return;
    }

    player.stopListen();
    message.channel.send("Stopped recording.");
  }

  async _handlePlay(message, args) {
    if (!message.member.voice.channel) {
      message.channel.send("You must be in a voice channel.");
      return;
    }

    if (!FastLink.node.anyNodeAvailable()) {
      message.channel.send("There aren't nodes connected.");
      return;
    }

    const player = new FastLink.player.Player(message.guild.id);
    if (!player.playerCreated()) player.createPlayer();

    player.connect(
      message.member.voice.channel.id.toString(),
      { mute: false, deaf: true },
      (guildId, payload) => {
        this.client.guilds.cache.get(guildId).shard.send(payload);
      }
    );

    // fastlink is very streamlined, not sure if this is possible, but if we can check if the player is paused, then we can add an if statement here to run the below line only if player state is paused and then ignoring load track WIP
    // player.update({ paused: false }), message.channel.send("Resumed.");

    const track = await player.loadTrack(
      (args.startsWith("https://") ? "" : "ytsearch:") + args
    );
    if (track.loadType === "error") {
      message.channel.send("Something went wrong. " + track.data.message);
      return;
    }

    if (track.loadType === "empty") {
      message.channel.send("No matches found.");
      return;
    }

    if (
      ["playlist", "album", "station", "show", "podcast", "artist"].includes(
        track.loadType
      )
    ) {
      player.update({
        tracks: {
          encodeds: track.data.tracks.map((track) => track.encoded),
        },
      });

      message.channel.send(
        `Added ${track.data.tracks.length} songs to the queue, and playing ${track.data.tracks[0].info.title}.`
      );
      return;
    }

    if (["track", "short"].includes(track.loadType)) {
      player.update({
        track: {
          encoded: track.data.encoded,
        },
      });

      message.channel.send(
        `Playing ${track.data.info.title} from ${track.data.info.sourceName} from url search.`
      );
      return;
    }

    if (track.loadType === "search") {
      player.update({
        track: {
          encoded: track.data[0].encoded,
        },
      });

      message.channel.send(
        `Playing ${track.data[0].info.title} from ${track.data[0].info.sourceName} from search.`
      );
      return;
    }
  }

  _handleVolume(message, args) {
    const player = new FastLink.player.Player(message.guild.id);
    if (!player.playerCreated()) {
      message.channel.send("No player found.");
      return;
    }

    player.update({ volume: parseInt(args) });
    message.channel.send(`Volume set to ${parseInt(args)}`);
  }

  _handlePause(message) {
    const player = new FastLink.player.Player(message.guild.id);
    if (!player.playerCreated()) {
      message.channel.send("No player found.");
      return;
    }

    player.update({ paused: true });
    message.channel.send("Paused.");
  }

  _handleResume(message) {
    const player = new FastLink.player.Player(message.guild.id);
    if (!player.playerCreated()) {
      message.channel.send("No player found.");
      return;
    }

    player.update({ paused: false });
    message.channel.send("Resumed.");
  }

  _handleSkip(message) {
    const player = new FastLink.player.Player(message.guild.id);
    if (!player.playerCreated()) {
      message.channel.send("No player found.");
      return;
    }

    const skip = player.skipTrack();
    if (skip) message.channel.send("Skipped the current track.");
    else message.channel.send("Could not skip the current track.");
  }

  _handleStop(message) {
    const player = new FastLink.player.Player(message.guild.id);
    if (!player.playerCreated()) {
      message.channel.send("No player found.");
      return;
    }

    player.update({
      track: {
        encoded: null,
      },
    });

    message.channel.send("Stopped the player.");
  }

  start() {
    this.client.login(this.token);
  }
}

export default MusicBot;