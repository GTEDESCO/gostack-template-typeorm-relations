import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateProductService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError('Customer not exists.');
    }

    const checkNegativesValues = products.some(
      product => product.quantity <= 0,
    );

    if (checkNegativesValues) {
      throw new AppError('You cannot set quantity less than zero');
    }

    const productsFound = await this.productsRepository.findAllById(products);

    if (productsFound.length !== products.length) {
      throw new AppError(
        'There is one or more products that is not located in database',
      );
    }

    const isOutOfStock = productsFound.some(pf =>
      products.some(ps => {
        return pf.quantity - ps.quantity < 0;
      }),
    );

    if (isOutOfStock) {
      throw new AppError('There is one or more products that is out of stock');
    }

    const productsMapped = productsFound.map(productMap => ({
      product_id: productMap.id,
      price: productMap.price,
      quantity:
        products.find(productFind => productFind.id === productMap.id)
          ?.quantity || 0,
    }));

    const order = await this.ordersRepository.create({
      customer,
      products: productsMapped,
    });

    await this.productsRepository.updateQuantity(
      productsFound.map(productMap => {
        const productFound = products.find(
          productFind => productFind.id === productMap.id,
        );

        return {
          id: productMap.id,
          quantity: productFound
            ? productMap.quantity - productFound.quantity
            : productMap.quantity,
        };
      }),
    );

    return order;
  }
}

export default CreateProductService;
