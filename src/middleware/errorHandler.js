exports.notFound = (req, res, next) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
};

exports.errorHandler = (err, req, res, next) => {
  console.error(err);
  const status = err.statusCode || (res.statusCode >= 400 ? res.statusCode : 500);
  res.status(status).json({
    success: false,
    message: err.message || 'Server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};
