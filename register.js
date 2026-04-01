import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// =====================
// DATABASE
// =====================
await mongoose.connect(process.env.MONGO_URI);
console.log("✅ MongoDB connected");

const schema = new mongoose.Schema({
  userId: String,
  username: String,
  link: String,
  proof: String,
  rank: String,
});

const Submission = mongoose.model("Submission", schema);

// =====================
// CLIENT
// =====================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// =====================
// REGISTER SLASH COMMANDS (AUTO)
// =====================
const commands = [
  new SlashCommandBuilder()
    .setName("submit")
    .setDescription("Submit your edit")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log("✅ Slash commands registered");
  } catch (err) {
    console.error(err);
  }
});

// =====================
// INTERACTIONS
// =====================
client.on("interactionCreate", async (interaction) => {
  try {

    // =====================
    // /submit COMMAND
    // =====================
    if (interaction.isChatInputCommand() && interaction.commandName === "submit") {

      const modal = new ModalBuilder()
        .setCustomId(`submit-${interaction.user.id}`)
        .setTitle("Submit Your Edit");

      const linkInput = new TextInputBuilder()
        .setCustomId("link")
        .setLabel("Streamable Link")
        .setStyle(TextInputStyle.Short);

      const proofInput = new TextInputBuilder()
        .setCustomId("proof")
        .setLabel("Proof Image Link")
        .setStyle(TextInputStyle.Short);

      modal.addComponents(
        new ActionRowBuilder().addComponents(linkInput),
        new ActionRowBuilder().addComponents(proofInput)
      );

      return interaction.showModal(modal);
    }

    // =====================
    // SUBMIT MODAL
    // =====================
    if (interaction.isModalSubmit() && interaction.customId.startsWith("submit")) {

      const userId = interaction.user.id;
      const link = interaction.fields.getTextInputValue("link");
      const proof = interaction.fields.getTextInputValue("proof");

      await Submission.create({
        userId,
        username: interaction.user.username,
        link,
        proof
      });

      const channel = await client.channels.fetch(process.env.CHANNEL_ID);

      const embed = new EmbedBuilder()
        .setTitle("📩 New Submission")
        .addFields(
          { name: "User", value: `<@${userId}>` },
          { name: "Edit Link", value: link },
          { name: "Proof", value: proof }
        )
        .setColor("Blue");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`review-${userId}`)
          .setLabel("Review")
          .setStyle(ButtonStyle.Primary)
      );

      await channel.send({
        embeds: [embed],
        components: [row]
      });

      return interaction.reply({
        content: "✅ Submitted!",
        ephemeral: true
      });
    }

    // =====================
    // REVIEW BUTTON (ADMIN)
    // =====================
    if (interaction.isButton() && interaction.customId.startsWith("review")) {

      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return interaction.reply({ content: "❌ No permission", ephemeral: true });
      }

      const userId = interaction.customId.split("-")[1];

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`rank-${userId}`)
        .setPlaceholder("Select Rank")
        .addOptions([
          "B","A","A+","S","S+","SS","SS+","SSS","World Class"
        ].map(r => ({ label: r, value: r })));

      return interaction.reply({
        content: "Choose rank:",
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true
      });
    }

    // =====================
    // SELECT RANK
    // =====================
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("rank")) {

      const userId = interaction.customId.split("-")[1];
      const rank = interaction.values[0];

      await Submission.findOneAndUpdate(
        { userId },
        { rank },
        { upsert: true }
      );

      const modal = new ModalBuilder()
        .setCustomId(`msg-${userId}-${rank}`)
        .setTitle("Send Message");

      const input = new TextInputBuilder()
        .setCustomId("msg")
        .setLabel("Message to user")
        .setStyle(TextInputStyle.Paragraph);

      modal.addComponents(new ActionRowBuilder().addComponents(input));

      return interaction.showModal(modal);
    }

    // =====================
    // SEND RESULT TO USER
    // =====================
    if (interaction.isModalSubmit() && interaction.customId.startsWith("msg")) {

      const parts = interaction.customId.split("-");
      const userId = parts[1];
      const rank = parts[2];
      const msg = interaction.fields.getTextInputValue("msg");

      const user = await client.users.fetch(userId);

      await user.send(`🏆 Rank: **${rank}**\n💬 ${msg}`);

      return interaction.reply({
        content: "✅ Sent to user!",
        ephemeral: true
      });
    }

  } catch (err) {
    console.error(err);
  }
});

// =====================
// LOGIN
// =====================
client.login(process.env.DISCORD_TOKEN);
