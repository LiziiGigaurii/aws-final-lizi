<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Image upload

Create a `.env` file with the following values before starting the application:

```env
MONGO_URI=mongodb://127.0.0.1:27017/aws-final
JWT_SECRET=super-secret-key
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_BUCKET_NAME=your-bucket-name
```

After registering and logging in, send the returned JWT as a Bearer token:

```bash
curl -X POST http://localhost:3030/images \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@./photo.jpg"
```

The endpoint uploads the original file to S3, reads its dimensions and format with `sharp`, stores the image document in MongoDB, and returns the document ID, a one-hour signed S3 URL, and metadata.

S3 objects are organized with prefixes: original uploads use `originals/`, and transformed outputs use `transformed/`. S3 treats these prefixes as virtual folders.

### Transform an image

Use the image `id` returned by the upload endpoint:

```text
POST http://localhost:3030/images/IMAGE_ID/transform
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

Example request body for Postman:

```json
{
  "resize": { "width": 800, "height": 600 },
  "crop": { "width": 600, "height": 400, "x": 0, "y": 0 },
  "rotate": 90,
  "format": "jpeg",
  "filters": {
    "grayscale": true,
    "flip": false,
    "mirror": true,
    "sepia": false
  },
  "compress": { "quality": 80 }
}
```

The transformed file is uploaded to S3 with a new key and appended to the image document's `transformedKeys` array. The response contains the transformed file's signed URL and metadata.

### Retrieve images

Get one image owned by the authenticated user:

```text
GET http://localhost:3030/images/IMAGE_ID
Authorization: Bearer YOUR_TOKEN
```

List the authenticated user's images with pagination:

```text
GET http://localhost:3030/images?page=1&limit=10
Authorization: Bearer YOUR_TOKEN
```

The list uses MongoDB `skip` and `limit`, sorts newest images first, and returns signed URLs for the original and transformed files:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 0,
    "totalPages": 0,
    "hasNextPage": false
  }
}
```

### Security and error handling

- All image endpoints require a JWT Bearer token.
- Image details, transformations, lists, and deletion are restricted to the authenticated owner.
- Unknown request fields are rejected by the global validation pipe.
- Transformations are limited to 10 requests per minute per client.
- Errors use a common response shape with `statusCode`, `timestamp`, `path`, and `message`.

Delete an image and its S3 objects:

```text
DELETE http://localhost:3030/images/IMAGE_ID
Authorization: Bearer YOUR_TOKEN
```

### Favorites

Toggle an image as a favorite:

```text
PATCH http://localhost:3030/images/IMAGE_ID/favorite
Authorization: Bearer YOUR_TOKEN
```

Get only the authenticated user's favorites:

```text
GET http://localhost:3030/images/favorites?page=1&limit=10
Authorization: Bearer YOUR_TOKEN
```

The frontend also provides a `Favorites` tab and a star button on every image card. Favorite state is stored in MongoDB and survives refreshes and sign-ins.

## Project setup

```bash
$ npm install
```

## Frontend

The Next.js + TypeScript frontend lives in the sibling `client/` directory. Build it with `cd ../client && npm ci && npm run build`; Nest serves the exported `client/out` assets alongside the API from the same port. Run Nest from this `server/` directory and open `http://localhost:5050` (or the configured `PORT`).

## Swagger

Start the API and open `http://localhost:5050/api/docs` for the interactive OpenAPI documentation (or use the configured `PORT`). Image endpoints use Bearer JWT authentication; use the Swagger UI **Authorize** button after signing in.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

This project is already instrumented. Create a free account at [observe.nestjs.com](https://observe.nestjs.com), add an application, and paste the generated app key and secret into the `ObserveModule.forRoot()` call in `src/app.module.ts`.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
