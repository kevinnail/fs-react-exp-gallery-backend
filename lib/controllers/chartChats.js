const { Router } = require('express');
const ChartChat = require('../models/ChartChat.js');
const { askAboutCharts } = require('../services/chartChat.js');
const validateId = require('../middleware/validateId');
const { chartPeriodError } = require('../utils/chartPeriod.js');

const TITLE_LENGTH = 60;

// Cuts at the last whole word that fits, leaving room for the ellipsis.
const titleFrom = (content) => {
  const singleLine = content.replace(/\s+/g, ' ');
  if (singleLine.length <= TITLE_LENGTH) return singleLine;
  const cut = singleLine.slice(0, TITLE_LENGTH - 3);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}...`;
};

const sendError = ({ granularity, range, content }) => {
  const periodError = chartPeriodError({ granularity, range });
  if (periodError) return periodError;
  if (typeof content !== 'string' || content.trim() === '') {
    return 'content must be a non-empty string';
  }
  return null;
};

// Turns are saved only after the model replies, so a failed call leaves no
// unanswered question in the chat.
module.exports = Router()
  .post('/', async (req, res, next) => {
    try {
      const { granularity, range, content } = req.body;
      const validationError = sendError({ granularity, range, content });
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      const userTurn = { role: 'user', content: content.trim() };
      const reply = await askAboutCharts({ granularity, range, messages: [userTurn] });

      const chat = await ChartChat.create({
        title: titleFrom(userTurn.content),
        granularity,
        range,
        turns: [userTurn, { role: 'assistant', content: reply }],
      });

      res.status(201).json(chat);
    } catch (e) {
      next(e);
    }
  })

  .get('/:id', [validateId()], async (req, res, next) => {
    try {
      const chat = await ChartChat.getById(req.params.id);
      if (!chat) {
        return res.status(404).json({ message: 'Chat not found' });
      }

      res.json(chat);
    } catch (e) {
      next(e);
    }
  })

  .post('/:id/messages', [validateId()], async (req, res, next) => {
    try {
      const { granularity, range, content } = req.body;
      const validationError = sendError({ granularity, range, content });
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      const chat = await ChartChat.getById(req.params.id);
      if (!chat) {
        return res.status(404).json({ message: 'Chat not found' });
      }

      const userTurn = { role: 'user', content: content.trim() };
      const history = chat.messages.map(({ role, content: turnContent }) => ({
        role,
        content: turnContent,
      }));
      const reply = await askAboutCharts({
        granularity,
        range,
        messages: [...history, userTurn],
      });

      const messages = await ChartChat.appendTurns(chat.id, {
        granularity,
        range,
        turns: [userTurn, { role: 'assistant', content: reply }],
      });
      // Deleted while the model was answering
      if (!messages) {
        return res.status(404).json({ message: 'Chat not found' });
      }

      res.status(201).json(messages);
    } catch (e) {
      next(e);
    }
  });
