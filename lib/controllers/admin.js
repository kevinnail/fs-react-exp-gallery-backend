const { Router } = require('express');
// const authDelUp = require('../middleware/authDelUp');
const User = require('../models/User.js');
const Post = require('../models/Post.js');

module.exports = Router()
  .get('/', async (req, res) => {
    const user = await User.getByEmail(req.user.email);
    await user.getGalleryPosts();
    res.json(user.galleryPosts);
  })

  .post('/', async (req, res) => {
    const post = await Post.postNewPost(
      req.body.title,
      req.body.description,
      req.body.image_url,
      req.body.category,
      req.body.price,
      req.user.id
    );

    res.json(post);
  });

//
//
//   .put('/:id', [authDelUp], async (req, res) => {
//     const   CHANGE_THIS_NAME = await  CHANGE_THIS_NAME.toggleComplete(req.body.mark, req.body. CHANGE_THIS_NAME_id);
//     res.json(   CHANGE_THIS_NAME);
//   })
//   .delete('/:id', [authDelUp], async (req, res) => {
//     const data = await  CHANGE_THIS_NAME.deleteById(req.params.id);
//     res.json(data);
//   })
//   .get('/:id', [authDelUp], async (req, res) => {
//     const data = await  CHANGE_THIS_NAME.getById(req.params.id);
//     res.json(data);
//   })
//   .put('/edit/:id', [authDelUp], async (req, res) => {
//     const data = await  CHANGE_THIS_NAME.updateById(req.body.id, req.body.task);
//     res.json(data);
//   });
