const router = require('express').Router();
const { protect, adminOnly, optionalProtect } = require('../middleware/auth');
const controller = require('../controllers/articleController');

router.get('/', optionalProtect, controller.list);
router.get('/:slug', optionalProtect, controller.get);
router.post('/', protect, adminOnly, controller.save);
router.put('/:id', protect, adminOnly, controller.save);
router.delete('/:id', protect, adminOnly, controller.remove);
module.exports = router;
