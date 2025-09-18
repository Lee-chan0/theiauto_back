import joi from 'joi';

const adminSchema = joi.object({
  loginId: joi.string().min(3).max(10).required(),
  email: joi.string().email().required(),
  password: joi.string().min(6).required(),
  rank: joi.string().valid('편집장', '기자').required(),
  name: joi.string().min(3).max(10).required(),
  signupCode: joi.string().required(),
});

export { adminSchema };