package adapters

import (
	"context"
	"fmt"
	"strings"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

type TelegramAdapter struct {
	bot *tgbotapi.BotAPI
}

func NewTelegram(token string) (*TelegramAdapter, error) {
	bot, err := tgbotapi.NewBotAPI(token)
	if err != nil {
		return nil, err
	}
	return &TelegramAdapter{bot: bot}, nil
}

func (a *TelegramAdapter) Provider() string { return "telegram" }

func (a *TelegramAdapter) SendText(_ context.Context, chatID, text string) error {
	id, err := parseChatID(chatID)
	if err != nil {
		return err
	}
	msg := tgbotapi.NewMessage(id, toHTML(text))
	msg.ParseMode = "HTML"
	msg.DisableWebPagePreview = false
	_, err = a.bot.Send(msg)
	return err
}

func (a *TelegramAdapter) SendImage(_ context.Context, chatID, imageURL, caption string) error {
	id, err := parseChatID(chatID)
	if err != nil {
		return err
	}
	photo := tgbotapi.NewPhoto(id, tgbotapi.FileURL(imageURL))
	photo.Caption = toHTML(caption)
	photo.ParseMode = "HTML"
	_, err = a.bot.Send(photo)
	return err
}

// GetUpdates retorna atualizações para polling.
func (a *TelegramAdapter) GetUpdates(offset int64) ([]tgbotapi.Update, int64, error) {
	u := tgbotapi.NewUpdate(int(offset))
	u.Timeout = 25
	updates, err := a.bot.GetUpdates(u)
	if err != nil {
		return nil, offset, err
	}
	nextOffset := offset
	for _, upd := range updates {
		if int64(upd.UpdateID)+1 > nextOffset {
			nextOffset = int64(upd.UpdateID) + 1
		}
	}
	return updates, nextOffset, nil
}

// toHTML converte marcação simples Markdown-like para HTML do Telegram.
func toHTML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	// *bold* → <b>bold</b>
	s = replacePairs(s, "*", "<b>", "</b>")
	// _italic_ → <i>italic</i>
	s = replacePairs(s, "_", "<i>", "</i>")
	return s
}

func replacePairs(s, delim, open, close string) string {
	parts := strings.Split(s, delim)
	if len(parts) < 3 {
		return s
	}
	var sb strings.Builder
	for i, part := range parts {
		if i%2 == 1 {
			sb.WriteString(open)
			sb.WriteString(part)
			sb.WriteString(close)
		} else {
			sb.WriteString(part)
		}
	}
	return sb.String()
}

func parseChatID(chatID string) (int64, error) {
	var id int64
	if _, err := fmt.Sscanf(chatID, "%d", &id); err != nil {
		return 0, fmt.Errorf("invalid chat_id %q: %w", chatID, err)
	}
	return id, nil
}
