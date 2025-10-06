const validateId = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];

    if (isNaN(Number(id))) {
      return res.status(400).json({
        error: `Invalid ${paramName}: must be a number`,
      });
    }

    next();
  };
};

module.exports = validateId;
