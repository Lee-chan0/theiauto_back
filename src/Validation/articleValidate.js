import joi from 'joi';

const articleSchema = joi.object({
  articleTitle: joi.string().min(8).max(100).required(),
  articleSubTitle: joi.string().min(8).max(100).required(),
  articleContent: joi.string().required(),
  categoryId: joi.required(),
  tagName: joi.required()
});

export { articleSchema };