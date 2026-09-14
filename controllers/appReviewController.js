const mongoose = require("mongoose");
const AppReview = require("../models/AppReview");
const listAppReviews = async (req, res, next) => { try { res.json({ reviews: await AppReview.find().populate("customerId", "name email").sort({ createdAt: -1 }) }); } catch (err) { next(err); } };
const createAppReview = async (req, res, next) => { try { const { rating, comment } = req.body; if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !comment?.trim()) return res.status(400).json({ message: "Rating (1-5) and review are required" }); const review = await AppReview.create({ customerId: req.user._id, rating, comment: comment.trim() }); res.status(201).json({ review }); } catch (err) { next(err); } };
const deleteAppReview = async (req, res, next) => { try { if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid app review ID" }); const review = await AppReview.findByIdAndDelete(req.params.id); if (!review) return res.status(404).json({ message: "App review not found" }); res.json({ message: "App review deleted successfully" }); } catch (err) { next(err); } };
module.exports = { listAppReviews, createAppReview, deleteAppReview };
