export interface Product {
  id: number;
  title: string;
  description: string;
  price: number;
  rating: number;
  thumbnail: string;
}

export interface LoginResponseBody {
  accessToken: string;
  username: string;
}
