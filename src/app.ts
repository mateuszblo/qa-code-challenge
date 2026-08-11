import express, { Request, Response, NextFunction } from 'express';
import json from 'body-parser';
import cors from 'cors';
import axios from 'axios';
import { Product, CartContent } from './types';

const app = express();

app.use(cors());

app.use(express.static('public'))

app.use(json());

app.get('/', (req: Request, res: Response) => {
  res.send('Hello, World!');
});

app.get('/products', async (req: Request, res: Response) => {
  const PRODUCTS_URL = 'https://dummyjson.com/products';

  const products = (await axios.get(PRODUCTS_URL)).data;

  res.send(products.products);
});

app.post('/login', async (req: Request, res: Response) => {
  const username = req.body.username;
  const password = req.body.password;

  const LOGIN_URL = 'https://dummyjson.com/auth/login';

  const credentials = {
    username,
    password,
  };

  const user = (await axios.post(LOGIN_URL, JSON.stringify(credentials), {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  ).data;

  res.send(user);
});

app.post('/cart', async (req: Request, res: Response) => {
  const cartContent: CartContent = {
    grandTotal: 0,
    productList: [],
  };
  res.send(cartContent);
});

app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(404).send();
});

export default app;
